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

class ComponentsService {
  /**
   * @param {Context} context
   * @param templateContent
   */
  constructor(context, templateContent) {
    this.context = context;
    this.templateContent = templateContent;

    // Variables that will be populated during init
    this.resolvedTemplate = null;
    this.allComponents = null;
    this.componentsGraph = null;
  }

  async init() {
    await this.context.init();
    const template = await getTemplate(this.templateContent);

    this.context.logVerbose(`Resolving the template's static variables.`);
    const resolvedTemplate = resolveTemplate(template);

    this.resolvedTemplate = resolvedTemplate;

    this.context.logVerbose('Collecting components from the template.');

    const allComponents = await getAllComponents(resolvedTemplate);

    this.context.logVerbose(`Analyzing the template's components dependencies.`);

    const allComponentsWithDependencies = setDependencies(allComponents);

    this.allComponents = allComponentsWithDependencies;

    this.context.logVerbose(`Creating the template's components graph.`);

    // TODO: THAT GRAPH MIGHT BE ADJUSTED OVER THE COURSE OF PROCESSING
    const graph = createGraph(allComponentsWithDependencies);
    this.componentsGraph = graph;
  }

  async deploy() {
    this.context.logger.log();
    this.context.logger.log(`Deploying to stage ${this.context.stage}`);

    await this.invokeComponentsInGraph({ method: 'deploy' });

    await this.outputs();
  }

  async outputs() {
    const outputs = await this.context.stateStorage.readComponentsOutputs();
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
    progresses.start(componentName, command);

    this.context.logVerbose(`Instantiating components.`);
    await this.instantiateComponents();

    const component = this.allComponents?.[componentName]?.instance;
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
        progresses.error(componentName, e);
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
      progresses.error(componentName, e);
    }
  }

  async invokeComponentsInGraph({ method, reverse }) {
    this.context.logVerbose(`Executing the template's components graph.`);
    await this.executeComponentsGraph({ method });
  }

  async invokeComponentsInParallel(method) {
    this.context.logVerbose(`Instantiating components.`);
    await this.instantiateComponents();

    this.context.logVerbose(`Invoking components in parallel.`);
    const promises = Object.values(this.allComponents).map(async ({ instance }) => {
      if (typeof instance[method] === 'function') {
        progresses.add(instance.id, false);
        progresses.start(instance.id, 'method');
        try {
          await instance[method]();
        } catch (e) {
          // TODO error details
          progresses.error(instance.id, e);
          return;
        }
        progresses.success(instance.id);
      }
    });

    await Promise.all(promises);
  }

  async remove() {
    this.context.logger.log();
    this.context.logger.log(
      `Removing stage ${this.context.stage} of ${this.resolvedTemplate.name}`
    );

    await this.invokeComponentsInGraph({ method: 'remove', reverse: true });
    this.context.stateStorage.removeState();
    return {};
  }

  async executeComponentsGraph({ method, reverse }) {
    let nodes;
    if (reverse) {
      nodes = this.componentsGraph.sources();
    } else {
      nodes = this.componentsGraph.sinks();
    }

    if (isEmpty(nodes)) {
      return this.allComponents;
    }

    const promises = [];

    for (const alias of nodes) {
      const componentData = this.componentsGraph.node(alias);

      const fn = async () => {
        const availableOutputs = await this.context.stateStorage.readComponentsOutputs();
        const inputs = resolveObject(this.allComponents[alias].inputs, availableOutputs);
        progresses.start(alias, method);

        try {
          inputs.service = this.resolvedTemplate.name;
          inputs.componentId = alias;

          const component = await loadComponent({
            context: this.context,
            path: componentData.path,
            alias,
            inputs,
          });
          this.allComponents[alias].instance = component;

          // Check the existence of the method on the component
          if (typeof component[method] !== 'function') {
            throw new Error(`Missing method ${method} on component ${alias}`);
          }

          await component[method]();
        } catch (e) {
          // TODO show more details
          progresses.error(alias, e);
          return;
        }

        progresses.success(alias);
      };

      promises.push(fn());
    }

    await Promise.all(promises);

    for (const alias of nodes) {
      this.componentsGraph.removeNode(alias);
    }

    return this.executeComponentsGraph({ method, reverse });
  }

  async instantiateComponents() {
    const leaves = this.componentsGraph.sinks();

    if (isEmpty(leaves)) {
      return;
    }

    const promises = [];

    for (const alias of leaves) {
      const componentData = this.componentsGraph.node(alias);

      const fn = async () => {
        const availableOutputs = await this.context.stateStorage.readComponentsOutputs();
        const inputs = resolveObject(this.allComponents[alias].inputs, availableOutputs);

        inputs.service = this.resolvedTemplate.name;
        inputs.componentId = alias;

        this.allComponents[alias].instance = await loadComponent({
          context: this.context,
          path: componentData.path,
          alias,
          inputs,
        });
      };

      promises.push(fn());
    }

    await Promise.all(promises);

    for (const alias of leaves) {
      this.componentsGraph.removeNode(alias);
    }

    return this.instantiateComponents();
  }
}

module.exports = ComponentsService;
