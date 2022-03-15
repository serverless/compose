'use strict';

const { resolve } = require('path');
const { isEmpty, path } = require('ramda');
const { Graph, alg } = require('graphlib');
const traverse = require('traverse');

const utils = require('./utils');
const { loadComponent } = require('./load');

const INTERNAL_COMPONENTS = {
  'serverless-framework': resolve(__dirname, '../components/framework'),
  'aws-cloudformation': resolve(__dirname, '../components/aws-cloudformation'),
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
        throw Error(
          `the variable ${match} cannot be resolved: the referenced output does not exist`
        );
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

const getAllComponents = async (obj = {}) => {
  const allComponents = {};

  for (const [key, val] of Object.entries(obj.services)) {
    if (val.component) {
      if (val.component[0] === '.') {
        const localComponentPath = resolve(process.cwd(), val.component, 'serverless.js');
        if (!(await utils.fileExists(localComponentPath))) {
          throw Error(`No serverless.js file found in ${val.component}`);
        }
        allComponents[key] = {
          path: val.component,
          inputs: val,
        };
      } else if (val.component in INTERNAL_COMPONENTS) {
        allComponents[key] = {
          path: INTERNAL_COMPONENTS[val.component],
          inputs: val,
        };
      } else {
        throw new Error(`Unrecognized component: ${obj[key].component}`);
      }
    } else {
      // By default assume `serverless-framework` component
      allComponents[key] = {
        path: INTERNAL_COMPONENTS['serverless-framework'],
        inputs: { ...val, component: 'serverless-framework' },
      };
    }
  }

  return allComponents;
};

const validateComponents = async (components) => {
  // We want to validate that there are no services that use the same path
  // Current implementation does not support that and running two `serverless` commands in the same
  // project directory could cause unexpected results
  for (const [componentKey, componentConfig] of Object.entries(components)) {
    const componentsWithTheSamePathAndType = Object.entries(components).filter(
      ([otherComponentKey, otherComponentConfig]) => {
        return (
          otherComponentKey !== componentKey &&
          componentConfig.inputs.component === otherComponentConfig.inputs.component &&
          componentConfig.inputs.path === otherComponentConfig.inputs.path
        );
      }
    );

    if (componentsWithTheSamePathAndType.length) {
      throw new Error(
        `Service "${componentKey}" has the same "path" as the following services: ${componentsWithTheSamePathAndType
          .map((item) => `"${item[0]}"`)
          .join(
            ', '
          )}. This is currently not supported because deploying such services in parallel generates packages in the same ".serverless/" directory which can cause conflicts.`
      );
    }
  }
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
            throw Error(`the referenced service in expression ${match} does not exist`);
          }

          accum.add(referencedComponent);
        }
      }

      return accum;
    }, new Set());

    if (typeof allComponents[alias].inputs.dependsOn === 'string') {
      const explicitDependency = allComponents[alias].inputs.dependsOn;
      if (!allComponents[explicitDependency]) {
        throw new Error(
          `The service "${explicitDependency}" referenced in "dependsOn" of "${alias}" does not exist`
        );
      }
      dependencies.add(explicitDependency);
    } else {
      const explicitDependencies = allComponents[alias].inputs.dependsOn || [];
      for (const explicitDependency of explicitDependencies) {
        if (!allComponents[explicitDependency]) {
          throw new Error(
            `The service "${explicitDependency}" referenced in "dependsOn" of "${alias}" does not exist`
          );
        }
        dependencies.add(explicitDependency);
      }
    }

    allComponents[alias].dependencies = Array.from(dependencies);
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
   * @param configuration
   */
  constructor(context, configuration) {
    this.context = context;
    this.configuration = configuration;

    // Variables that will be populated during init
    this.allComponents = null;
    this.componentsGraph = null;
  }

  async init() {
    const allComponents = await getAllComponents(this.configuration);
    await validateComponents(allComponents);
    this.allComponents = setDependencies(allComponents);

    // TODO: THAT GRAPH MIGHT BE ADJUSTED OVER THE COURSE OF PROCESSING
    this.componentsGraph = createGraph(this.allComponents);
  }

  async deploy() {
    this.context.logger.log();
    this.context.logger.log(`Deploying to stage ${this.context.stage}`);

    // Pre-emptively add all components to the progress list
    Object.keys(this.allComponents).forEach((componentName) => {
      this.context.progresses.add(componentName);
    });

    await this.executeComponentsGraph({ method: 'deploy', reverse: false });

    // Resolve the status of components that were not deployed
    Object.keys(this.allComponents).forEach((componentName) => {
      if (this.context.progresses.isWaiting(componentName)) {
        this.context.progresses.skipped(componentName);
        this.context.componentCommandsOutcomes[componentName] = 'skip';
      }
    });
  }

  async remove() {
    this.context.logger.log();
    this.context.logger.log(`Removing stage ${this.context.stage} of ${this.configuration.name}`);

    // Pre-emptively add all components to the progress list
    Object.keys(this.allComponents).forEach((componentName) => {
      this.context.progresses.add(componentName);
    });

    await this.executeComponentsGraph({ method: 'remove', reverse: true });
    await this.context.stateStorage.removeState();

    // Resolve the status of components that were not removed
    Object.keys(this.allComponents).forEach((componentName) => {
      if (this.context.progresses.isWaiting(componentName)) {
        this.context.progresses.skipped(componentName);
        this.context.componentCommandsOutcomes[componentName] = 'skip';
      }
    });
  }

  async logs(options) {
    await this.invokeComponentsInParallel('logs', options);
  }

  async info() {
    const outputs = await this.context.stateStorage.readComponentsOutputs();

    if (isEmpty(outputs)) {
      throw new Error('Could not find any deployed service');
    } else {
      this.context.renderOutputs(outputs);
    }
  }

  async invokeComponentCommand(componentName, command, options) {
    await this.instantiateComponents();

    const component = this.allComponents?.[componentName]?.instance;
    if (component === undefined) {
      throw new Error(`Unknown service ${componentName}`);
    }
    component.logVerbose(`Invoking "${command}" on service "${componentName}"`);

    const isDefaultCommand = ['deploy', 'remove', 'logs'].includes(command);

    let handler;
    if (isDefaultCommand) {
      // Default command defined for all components (deploy, logs, dev, etc.)
      if (!component?.[command]) {
        throw new Error(`No method "${command}" on service "${componentName}"`);
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
        throw new Error(`No command ${command} on service ${componentName}`);
      }
      const commandHandler = component.commands[command].handler;
      handler = (opts) => commandHandler.call(component, opts);
    }
    try {
      await handler(options);
      this.context.componentCommandsOutcomes[componentName] = 'success';
    } catch (e) {
      // If the component has an ongoing progress, we automatically set it to "error"
      if (this.context.progresses.exists(componentName)) {
        this.context.progresses.error(componentName, e);
      } else {
        this.context.logger.error(e);
      }
      this.context.componentCommandsOutcomes[componentName] = 'failure';
    }
  }

  async invokeComponentsInParallel(method, options) {
    await this.instantiateComponents();

    this.context.logVerbose(`Executing "${method}" across all services in parallel`);
    const promises = Object.values(this.allComponents).map(async ({ instance }) => {
      if (typeof instance[method] !== 'function') return;
      try {
        await instance[method](options);
        this.context.componentCommandsOutcomes[instance.id] = 'success';
      } catch (e) {
        // If the component has an ongoing progress, we automatically set it to "error"
        if (this.context.progresses.exists(instance.id)) {
          this.context.progresses.error(instance.id, e);
        } else {
          this.context.logger.error(e);
        }
        this.context.componentCommandsOutcomes[instance.id] = 'failure';
      }
    });

    await Promise.all(promises);
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
            throw new Error(`Missing method ${method} on service ${alias}`);
          }

          await component[method]();
          this.context.componentCommandsOutcomes[alias] = 'success';

          return true;
        } catch (e) {
          // If the component has an ongoing progress, we automatically set it to "error"
          if (this.context.progresses.exists(alias)) {
            this.context.progresses.error(alias, e);
          } else {
            this.context.logger.error(e);
          }
          this.context.componentCommandsOutcomes[alias] = 'failure';
          return false;
        }
      };

      promises.push(fn());
    }

    const results = await Promise.all(promises);
    const allSuccessful = results.reduce((carry, current) => carry && current, true);
    if (!allSuccessful) {
      // Skip next components if there was any error
      return {};
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
