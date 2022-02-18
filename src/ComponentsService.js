'use strict';

const { resolve, join } = require('path');
const { pick, isEmpty, path, uniq } = require('ramda');
const { Graph, alg } = require('graphlib');
const traverse = require('traverse');

const Component = require('./Component');
const Context = require('./Context');
const utils = require('./utils');
const { loadComponent } = require('./load');
const Progresses = require('./cli/Progresses');
const colors = require('./cli/colors');

const progresses = new Progresses();
progresses.setFooterText(colors.darkGray('Press [?] to enable verbose logs'));

const INTERNAL_COMPONENTS = {
  'serverless-framework': resolve(__dirname, '../components/framework'),
};

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
        allComponents[key] = {
          path: obj[key].component,
          inputs: obj[key],
        };
      } else if (obj[key].component in INTERNAL_COMPONENTS) {
        allComponents[key] = {
          path: INTERNAL_COMPONENTS[obj[key].component],
          inputs: obj[key],
        };
      } else {
        throw new Error(`Unrecognized component: ${obj[key].component}`);
      }
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

async function executeGraph({ serviceName, allComponents, graph, context, method, reverse }) {
  let nodes;
  if (reverse) {
    nodes = graph.sources();
  } else {
    nodes = graph.sinks();
  }

  if (isEmpty(nodes)) {
    return allComponents;
  }

  const promises = [];

  for (const alias of nodes) {
    const componentData = graph.node(alias);

    const fn = async () => {
      const availableOutputs = await context.stateStorage.readRootComponentsOutputs();
      const inputs = resolveObject(allComponents[alias].inputs, availableOutputs);
      progresses.start(alias, method);

      try {
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
      } catch (e) {
        // TODO show more details
        progresses.error(alias);
        return;
      }

      progresses.success(alias);
    };

    promises.push(fn());
  }

  await Promise.all(promises);

  for (const alias of nodes) {
    graph.removeNode(alias);
  }

  return executeGraph({ serviceName, allComponents, graph, context, method, reverse });
}

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

  async deploy() {
    this.context.logger.log();
    this.context.logger.log(`Deploying to stage ${this.context.stage}`);

    await this.invokeComponentsInGraph('deploy');

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

  shutdown() {
    progresses.stopAll();
  }

  async invokeComponentCommand(componentName, command, options) {
    const { serviceName, allComponents, graph } = await this.boot();

    progresses.start(componentName, command);

    this.context.logVerbose(`Instantiating components.`);
    await instantiateComponents(serviceName, allComponents, graph, this.context);

    const component = allComponents?.[componentName]?.instance;
    if (component === undefined) {
      throw new Error(`Unknown component ${componentName}`);
    }
    component.logVerbose(`Invoking "${command}".`);

    const defaultCommands = ['deploy', 'dev', 'logs'];
    if (defaultCommands.includes(command)) {
      if (!component?.[command]) {
        throw new Error(`No method ${command} on component ${componentName}`);
      }
      return await component[command](options);
    }
    // Workaround to invoke all custom Framework commands
    // TODO: Support options and validation
    if (!component.commands?.[command] && component.inputs.component === 'serverless-framework') {
      const handler = component.command;
      try {
        await handler.call(component, command, options);
        progresses.success(componentName);
      } catch (e) {
        // TODO: Provide better details about error
        progresses.error(componentName);
      }
      return;
    }
    if (!component.commands?.[command]) {
      throw new Error(`No command ${command} on component ${componentName}`);
    }
    const handler = component.commands?.[command].handler;
    try {
      await handler.call(component, options);
      progresses.success(componentName);
    } catch (e) {
      // TODO: Provide better details about error
      progresses.error(componentName);
    }
  }

  async invokeComponentsInGraph(method) {
    const { serviceName, allComponents, graph } = await this.boot();

    this.context.logVerbose(`Executing the template's components graph.`);
    await executeGraph({ serviceName, allComponents, graph, context: this.context, method });
  }

  async invokeComponentsInParallel(method) {
    const { serviceName, allComponents, graph } = await this.boot();

    this.context.logVerbose(`Instantiating components.`);
    await instantiateComponents(serviceName, allComponents, graph, this.context);

    this.context.logVerbose(`Invoking components in parallel.`);
    const promises = Object.values(allComponents).map(async ({ instance }) => {
      if (typeof instance[method] === 'function') {
        progresses.add(instance.id, false);
        progresses.start(instance.id, 'method');
        try {
          await instance[method]();
        } catch (e) {
          // TODO error details
          progresses.error(instance.id);
          return;
        }
        progresses.success(instance.id);
      }
    });

    await Promise.all(promises);
  }

  async boot() {
    const template = await getTemplate(this.templateContent);

    this.context.logVerbose(`Resolving the template's static variables.`);

    const resolvedTemplate = resolveTemplate(template);

    this.context.logVerbose('Collecting components from the template.');

    const allComponents = await getAllComponents(resolvedTemplate);

    this.context.logVerbose(`Analyzing the template's components dependencies.`);

    const allComponentsWithDependencies = setDependencies(allComponents);

    this.context.logVerbose(`Creating the template's components graph.`);

    const graph = createGraph(allComponentsWithDependencies);

    return {
      serviceName: resolvedTemplate.name,
      allComponents: allComponentsWithDependencies,
      graph,
    };
  }

  async remove() {
    const { serviceName, allComponents, graph } = await this.boot();

    this.context.logger.log();
    this.context.logger.log(`Removing stage ${this.context.stage} of ${serviceName}`);

    await executeGraph({
      serviceName,
      allComponents,
      graph,
      context: this.context,
      method: 'remove',
      reverse: true,
    });
    this.context.stateStorage.removeState();
    return {};
  }
}

module.exports = ComponentsService;
