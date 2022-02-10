const { resolve, join } = require('path');
const { pick, isEmpty, path, uniq } = require('ramda');
const { Graph, alg } = require('graphlib');
const traverse = require('traverse');

const Component = require('./Component');
const Context = require('./Context');
const utils = require('./utils');
const { loadComponent } = require('./load');

const resolveObject = (object, context) => {
  const regex = /\${(\w*:?[\w\d.-]+)}/g;

  const resolvedObject = traverse(object).forEach(function (value) {
    const matches = typeof value === 'string' ? value.match(regex) : null;
    if (matches) {
      let newValue = value;
      for (const match of matches) {
        const referencedPropertyPath = match.substring(2, match.length - 1).split('.');
        const referencedPropertyValue = path(referencedPropertyPath, context);

        if (referencedPropertyValue === undefined) {
          throw Error(`invalid reference ${match}`);
        }

        if (match === value) {
          newValue = referencedPropertyValue;
        } else if (typeof referencedPropertyValue === 'string') {
          newValue = newValue.replace(match, referencedPropertyValue);
        } else {
          throw Error(`the referenced substring is not a string`);
        }
      }
      this.update(newValue);
    }
  });

  return resolvedObject;
};

const validateGraph = (graph) => {
  const isAcyclic = alg.isAcyclic(graph);
  if (!isAcyclic) {
    const cycles = alg.findCycles(graph);
    let msg = ['Your template has circular dependencies:'];
    cycles.forEach((cycle, index) => {
      let fromAToB = cycle.join(' --> ');
      fromAToB = `${(index += 1)}. ${fromAToB}`;
      const fromBToA = cycle.reverse().join(' <-- ');
      const padLength = fromAToB.length + 4;
      msg.push(fromAToB.padStart(padLength));
      msg.push(fromBToA.padStart(padLength));
    }, cycles);
    msg = msg.join('\n');
    throw new Error(msg);
  }
};

const getTemplate = async (template) => {
  if (typeof template === 'string') {
    if (
      (!utils.isJsonPath(template) && !utils.isYamlPath(template)) ||
      !(await utils.fileExists(template))
    ) {
      throw Error('the referenced template path does not exist');
    }

    return utils.readFile(template);
  } else if (typeof template !== 'object') {
    throw Error(
      'the template input could either be an object, or a string path to a template file'
    );
  }
  return template;
};

const resolveTemplate = (template) => {
  const regex = /\${(\w*:?[\w\d.-]+)}/g;
  let variableResolved = false;
  const resolvedTemplate = traverse(template).forEach(function (value) {
    const matches = typeof value === 'string' ? value.match(regex) : null;
    if (matches) {
      let newValue = value;
      for (const match of matches) {
        const referencedPropertyPath = match.substring(2, match.length - 1).split('.');
        const referencedTopLevelProperty = referencedPropertyPath[0];
        if (/\${env\.(\w*:?[\w\d.-]+)}/g.test(match)) {
          newValue = process.env[referencedPropertyPath[1]];
          variableResolved = true;
        } else {
          if (!template[referencedTopLevelProperty]) {
            throw Error(`invalid reference ${match}`);
          }

          if (!template[referencedTopLevelProperty].component) {
            variableResolved = true;
            const referencedPropertyValue = path(referencedPropertyPath, template);

            if (referencedPropertyValue === undefined) {
              throw Error(`invalid reference ${match}`);
            }

            if (match === value) {
              newValue = referencedPropertyValue;
            } else if (typeof referencedPropertyValue === 'string') {
              newValue = newValue.replace(match, referencedPropertyValue);
            } else {
              throw Error(`the referenced substring is not a string`);
            }
          }
        }
      }
      this.update(newValue);
    }
  });
  if (variableResolved) {
    return resolveTemplate(resolvedTemplate);
  }
  return resolvedTemplate;
};

const getAllComponents = async (obj = {}) => {
  const allComponents = {};

  for (const key in obj) {
    if (obj[key] && obj[key].component) {
      // local components start with a .
      if (obj[key].component[0] === '.') {
        // todo should local component paths be relative to cwd?
        const localComponentPath = resolve(process.cwd(), obj[key].component, 'serverless.js');
        if (!(await utils.fileExists(localComponentPath))) {
          throw Error(`No serverless.js file found in ${obj[key].component}`);
        }
      }
      allComponents[key] = {
        path: obj[key].component,
        inputs: obj[key],
      };
    }
  }

  return allComponents;
};

const setDependencies = (allComponents) => {
  const regex = /\${(\w*:?[\w\d.-]+)}/g;

  for (const alias in allComponents) {
    const dependencies = traverse(allComponents[alias].inputs).reduce(function (accum, value) {
      const matches = typeof value === 'string' ? value.match(regex) : null;
      if (matches) {
        for (const match of matches) {
          const referencedComponent = match.substring(2, match.length - 1).split('.')[0];

          if (!allComponents[referencedComponent]) {
            throw Error(`the referenced component in expression ${match} does not exist`);
          }

          if (!accum.includes(referencedComponent)) {
            accum.push(referencedComponent);
          }
        }
      }
      return accum;
    }, []);

    allComponents[alias].dependencies = dependencies;
  }

  return allComponents;
};

const createGraph = (allComponents) => {
  const graph = new Graph();

  for (const alias in allComponents) {
    graph.setNode(alias, allComponents[alias]);
  }

  for (const alias in allComponents) {
    const { dependencies } = allComponents[alias];
    if (!isEmpty(dependencies)) {
      for (const dependency of dependencies) {
        graph.setEdge(alias, dependency);
      }
    }
  }

  validateGraph(graph);

  return graph;
};

async function instantiateComponents(serviceName, allComponents, graph, context) {
  const leaves = graph.sinks();

  if (isEmpty(leaves)) {
    return allComponents;
  }

  const promises = [];

  for (const alias of leaves) {
    const componentData = graph.node(alias);

    const fn = async () => {
      const availableOutputs = await context.stateStorage.readRootComponentsOutputs();
      const inputs = resolveObject(allComponents[alias].inputs, availableOutputs);

      inputs.service = serviceName;
      inputs.componentId = alias;

      allComponents[alias].instance = await loadComponent({
        context: context,
        path: componentData.path,
        alias,
        inputs,
      });
    };

    promises.push(fn());
  }

  await Promise.all(promises);

  for (const alias of leaves) {
    graph.removeNode(alias);
  }

  return instantiateComponents(serviceName, allComponents, graph, context);
}

async function executeGraph(serviceName, allComponents, graph, context, method) {
  const leaves = graph.sinks();

  if (isEmpty(leaves)) {
    return allComponents;
  }

  const promises = [];

  for (const alias of leaves) {
    const componentData = graph.node(alias);

    const fn = async () => {
      const availableOutputs = await context.stateStorage.readRootComponentsOutputs();
      const inputs = resolveObject(allComponents[alias].inputs, availableOutputs);
      context.status(method, alias);

      inputs.service = serviceName;
      inputs.componentId = alias;

      const component = await loadComponent({
        context: context,
        path: componentData.path,
        alias,
        inputs,
      });
      allComponents[alias].instance = component;

      // Check the existence of the method on the component
      if (typeof component[method] !== 'function') {
        throw new Error(`Missing method ${method} on component ${alias}`);
      }

      await component[method]();
    };

    promises.push(fn());
  }

  await Promise.all(promises);

  for (const alias of leaves) {
    graph.removeNode(alias);
  }

  return executeGraph(serviceName, allComponents, graph, context, method);
}

const syncState = async (allComponents, instance) => {
  const promises = [];

  for (const alias in instance.state.components || {}) {
    if (!allComponents[alias]) {
      const fn = async () => {
        throw new Error('Removing components is not supported yet');

        const component = await instance.load(instance.state.components[alias], alias);
        instance.context.status('Removing', alias);

        await component.remove();
      };

      promises.push(fn());
    }
  }

  await Promise.all(promises);

  instance.state.components = {};

  for (const alias in allComponents) {
    instance.state.components[alias] = allComponents[alias].path;
  }

  await instance.save();
};

class ComponentsService {
  /**
   * @param {Context} context
   * @param templateContent
   */
  constructor(context, templateContent) {
    this.context = context;
    this.templateContent = templateContent;
  }

  async init() {
    await this.context.init();
  }

  async default() {
    return this.deploy();
  }

  async deploy() {
    await this.invokeComponentsInGraph('deploy');

    this.context.status('done', 'deploy');

    await this.outputs();
  }

  async outputs() {
    const outputs = await this.context.stateStorage.readRootComponentsOutputs();
    this.context.renderOutputs(outputs);
  }

  async logs() {
    await this.invokeComponentsInParallel('logs');
  }

  async dev() {
    await this.invokeComponentsInParallel('dev');
  }

  async invokeComponentCommand(componentName, command, options) {
    const { serviceName, allComponents, graph } = await this.boot();

    this.context.status(command, componentName);

    this.context.debug(`Instantiating components.`);
    await instantiateComponents(serviceName, allComponents, graph, this.context);

    this.context.debug(`Invoking "${command}" on component ${componentName}.`);
    const component = allComponents?.[componentName]?.instance;
    if (component === undefined) {
      throw new Error(`Unknown component ${componentName}`);
    }
    const defaultCommands = ['deploy', 'dev', 'logs'];
    if (defaultCommands.includes(command)) {
      if (!component?.[command]) {
        throw new Error(`No method ${command} on component ${componentName}`);
      }
      return await component[command](options);
    }
    if (!component.commands?.[command]) {
      throw new Error(`No command ${command} on component ${componentName}`);
    }
    const handler = component.commands?.[command].handler;
    await handler.call(component, options);
  }

  async invokeComponentsInGraph(method) {
    this.context.status(method === 'default' || method === 'deploy' ? 'Deploying' : method);

    const { serviceName, allComponents, graph } = await this.boot();

    this.context.debug(`Executing the template's components graph.`);
    await executeGraph(serviceName, allComponents, graph, this.context, method);
  }

  async invokeComponentsInParallel(method) {
    const { serviceName, allComponents, graph } = await this.boot();

    this.context.status(method, 'all');

    this.context.debug(`Instantiating components.`);
    await instantiateComponents(serviceName, allComponents, graph, this.context);

    this.context.debug(`Invoking components in parallel.`);
    const promises = Object.values(allComponents).map(async ({ instance }) => {
      if (typeof instance[method] === 'function') {
        await instance[method]();
      }
    });

    await Promise.all(promises);
  }

  async boot() {
    this.context.status('Initializing');

    const template = await getTemplate(this.templateContent);

    this.context.debug(`Resolving the template's static variables.`);

    const resolvedTemplate = resolveTemplate(template);

    this.context.debug('Collecting components from the template.');

    const allComponents = await getAllComponents(resolvedTemplate);

    this.context.debug(`Analyzing the template's components dependencies.`);

    const allComponentsWithDependencies = setDependencies(allComponents);

    this.context.debug(`Creating the template's components graph.`);

    const graph = createGraph(allComponentsWithDependencies);

    return {
      serviceName: resolvedTemplate.name,
      allComponents: allComponentsWithDependencies,
      graph,
    };
  }

  async remove() {
    this.context.status('Removing');

    this.context.debug('Flushing template state and removing all components.');
    await syncState({}, this);

    return {};
  }
}

module.exports = ComponentsService;
