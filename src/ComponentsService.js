'use strict';

const { resolve } = require('path');
const { isEmpty, path } = require('ramda');
const { Graph, alg } = require('graphlib');
const traverse = require('traverse');

const utils = require('./utils');
const { loadComponent } = require('./load');

const INTERNAL_COMPONENTS = {
  'serverless-framework': resolve(__dirname, '../components/framework'),
};

const resolveObject = (object, context) => {
  const regex = /\${(\w*:?[\w\d.-]+)}/g;

  const resolvedObject = traverse(object).forEach(function (value) {
    const matches = typeof value === 'string' ? value.match(regex) : null;
    if (!matches) {
      return;
    }
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
        throw Error('the referenced substring is not a string');
      }
    }
    this.update(newValue);
  });

  return resolvedObject;
};

const validateGraph = (graph) => {
  const isAcyclic = alg.isAcyclic(graph);
  if (!isAcyclic) {
    const cycles = alg.findCycles(graph);
    const msg = ['Your template has circular dependencies:'];
    cycles.forEach((cycle, index) => {
      let fromAToB = cycle.join(' --> ');
      fromAToB = `${(index += 1)}. ${fromAToB}`;
      const fromBToA = cycle.reverse().join(' <-- ');
      const padLength = fromAToB.length + 4;
      msg.push(fromAToB.padStart(padLength));
      msg.push(fromBToA.padStart(padLength));
    }, cycles);
    throw new Error(msg.join('\n'));
  }
};

const getConfiguration = async (template) => {
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

const getAllComponents = async (obj = {}) => {
  const allComponents = {};

  for (const key of Object.keys(obj)) {
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

  for (const alias of Object.keys(allComponents)) {
    const dependencies = traverse(allComponents[alias].inputs).reduce((accum, value) => {
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

  for (const alias of Object.keys(allComponents)) {
    graph.setNode(alias, allComponents[alias]);
  }

  for (const alias of Object.keys(allComponents)) {
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
  /** @type {import('./Context')} */
  context;
  /**
   * @param {import('./Context')} context
   * @param templateContent
   */
  constructor(context, templateContent) {
    this.context = context;
    this.templateContent = templateContent;

    // Variables that will be populated during init
    this.configuration = null;
    this.allComponents = null;
    this.componentsGraph = null;
  }

  async init() {
    await this.context.init();
    const configuration = await getConfiguration(this.templateContent);
    this.configuration = configuration;

    const allComponents = await getAllComponents(configuration);

    const allComponentsWithDependencies = setDependencies(allComponents);

    this.allComponents = allComponentsWithDependencies;

    // TODO: THAT GRAPH MIGHT BE ADJUSTED OVER THE COURSE OF PROCESSING
    const graph = createGraph(allComponentsWithDependencies);
    this.componentsGraph = graph;
  }

  async deploy() {
    this.context.logger.log();
    this.context.logger.log(`Deploying to stage ${this.context.stage}`);

    await this.invokeComponentsInGraph({ method: 'deploy', reverse: false });
  }

  async logs(options) {
    await this.invokeComponentsInParallel('logs', options);
  }

  async info() {
    const outputs = await this.context.stateStorage.readComponentsOutputs();

    if (isEmpty(outputs)) {
      throw new Error('Could not find any deployed components');
    } else {
      this.context.renderOutputs(outputs);
    }
  }

  async invokeComponentCommand(componentName, command, options) {
    await this.instantiateComponents();

    const component = this.allComponents?.[componentName]?.instance;
    if (component === undefined) {
      throw new Error(`Unknown component ${componentName}`);
    }
    component.logVerbose(`Invoking "${command}" on component "${componentName}"`);

    const isDefaultCommand = ['deploy', 'remove', 'logs'].includes(command);

    let handler;
    if (isDefaultCommand) {
      // Default command defined for all components (deploy, logs, dev, etc.)
      if (!component?.[command]) {
        throw new Error(`No method "${command}" on component "${componentName}"`);
      }
      handler = (opts) => component[command](opts);
    } else if (
      !component.commands?.[command] &&
      component.inputs.component === 'serverless-framework'
    ) {
      // Workaround to invoke all custom Framework commands
      // TODO: Support options and validation
      handler = (opts) => component.command(command, opts);
    } else {
      // Custom command: the handler is defined in the component's `commands` property
      if (!component.commands?.[command]) {
        throw new Error(`No command ${command} on component ${componentName}`);
      }
      const commandHandler = component.commands[command].handler;
      handler = (opts) => commandHandler.call(component, opts);
    }
    try {
      await handler(options);
    } catch (e) {
      // If the component has an ongoing progress, we automatically set it to "error"
      if (this.context.progresses.exists(componentName)) {
        this.context.progresses.error(componentName, e);
      } else {
        this.context.logger.error(e);
      }
    }
  }

  async invokeComponentsInGraph({ method, reverse }) {
    this.context.logVerbose(`Executing "${method}" following the component dependency graph`);
    await this.executeComponentsGraph({ method, reverse });
  }

  async invokeComponentsInParallel(method, options) {
    await this.instantiateComponents();

    this.context.logVerbose(`Executing "${method}" across all components in parallel`);
    const promises = Object.values(this.allComponents).map(async ({ instance }) => {
      if (typeof instance[method] !== 'function') return;
      try {
        await instance[method](options);
      } catch (e) {
        // If the component has an ongoing progress, we automatically set it to "error"
        if (this.context.progresses.exists(instance.id)) {
          this.context.progresses.error(instance.id, e);
        } else {
          this.context.logger.error(e);
        }
      }
    });

    await Promise.all(promises);
  }

  async remove() {
    this.context.logger.log();
    this.context.logger.log(`Removing stage ${this.context.stage} of ${this.configuration.name}`);

    await this.invokeComponentsInGraph({ method: 'remove', reverse: true });
    await this.context.stateStorage.removeState();
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

    /** @type {Promise<boolean>[]} */
    const promises = [];

    for (const alias of nodes) {
      const componentData = this.componentsGraph.node(alias);

      const fn = async () => {
        const availableOutputs = await this.context.stateStorage.readComponentsOutputs();
        const inputs = resolveObject(this.allComponents[alias].inputs, availableOutputs);

        try {
          inputs.service = this.configuration.name;
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

          return true;
        } catch (e) {
          // If the component has an ongoing progress, we automatically set it to "error"
          if (this.context.progresses.exists(alias)) {
            this.context.progresses.error(alias, e);
          } else {
            this.context.logger.error(e);
          }
          return false;
        }
      };

      promises.push(fn());
    }

    const results = await Promise.all(promises);
    const allSuccessful = results.reduce((carry, current) => carry && current, true);
    if (!allSuccessful) {
      // Skip next components if there was any error
      return;
    }

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

        inputs.service = this.configuration.name;
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

    await this.instantiateComponents();
  }
}

module.exports = ComponentsService;
