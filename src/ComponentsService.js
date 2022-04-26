'use strict';

const { resolve } = require('path');
const { isEmpty, path } = require('ramda');
const { Graph, alg } = require('graphlib');
const traverse = require('traverse');
const ServerlessError = require('./serverless-error');

const utils = require('./utils');
const { loadComponent } = require('./load');
const colors = require('./cli/colors');

const INTERNAL_COMPONENTS = {
  'serverless-framework': resolve(__dirname, '../components/framework'),
  'aws-cloudformation': resolve(__dirname, '../components/aws-cloudformation'),
};

const formatError = (e) => {
  let formattedError = e instanceof Error ? e.message : e;
  if (formattedError.startsWith('Error:\n')) {
    formattedError = formattedError.slice(7);
  }
  return formattedError.trimEnd();
};

const resolveObject = (object, context, method) => {
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
        let errMsg = `The variable "${match}" cannot be resolved: the referenced output does not exist.`;
        if (method && !['refreshOutputs', 'deploy'].includes(method)) {
          errMsg +=
            '\n\nIf your project is not deployed, you can deploy it via "serverless deploy". If the project is already deployed, you can synchronize your local state via "serverless refresh-outputs".';
        }
        throw new ServerlessError(errMsg, 'REFERENCED_OUTPUT_DOES_NOT_EXIST');
      }

      if (match === value) {
        newValue = referencedPropertyValue;
      } else if (typeof referencedPropertyValue === 'string') {
        newValue = newValue.replace(match, referencedPropertyValue);
      } else {
        throw new ServerlessError(
          'The referenced substring is not a string',
          'REFERENCED_SUBSTRING_NOT_A_STRING'
        );
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
    throw new ServerlessError(msg.join('\n'), 'CIRCULAR_GRAPH_DEPENDENCIES');
  }
};

const getAllComponents = async (obj = {}) => {
  const allComponents = {};

  for (const [key, val] of Object.entries(obj.services)) {
    if (val.component) {
      if (val.component[0] === '.') {
        const localComponentPath = resolve(process.cwd(), val.component, 'serverless.js');
        if (!(await utils.fileExists(localComponentPath))) {
          throw new ServerlessError(
            `The component "${val.component}" (used by service "${key}") is invalid: no serverless.js file found`,
            'MISSING_SERVERLESS_FILE_IN_COMPONENT_PATH'
          );
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
        throw new ServerlessError(
          `Unrecognized component type "${val.component}" for service "${key}"`,
          'UNRECOGNIZED_COMPONENT'
        );
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
      throw new ServerlessError(
        `Service "${componentKey}" has the same "path" as the following services: ${componentsWithTheSamePathAndType
          .map((item) => `"${item[0]}"`)
          .join(
            ', '
          )}. This is currently not supported because deploying the same service in parallel generates packages in the same ".serverless/" directory which can cause conflicts.`,
        'DUPLICATED_COMPONENT_DEFINITION'
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
            throw new ServerlessError(
              `The service "${referencedComponent}" does not exist. It is referenced by "${alias}" in expression "${match}".`,
              'REFERENCED_COMPONENT_DOES_NOT_EXIST'
            );
          }

          accum.add(referencedComponent);
        }
      }

      return accum;
    }, new Set());

    if (typeof allComponents[alias].inputs.dependsOn === 'string') {
      const explicitDependency = allComponents[alias].inputs.dependsOn;
      if (!allComponents[explicitDependency]) {
        throw new ServerlessError(
          `The service "${explicitDependency}" referenced in "dependsOn" of "${alias}" does not exist`,
          'REFERENCED_COMPONENT_DOES_NOT_EXIST'
        );
      }
      dependencies.add(explicitDependency);
    } else {
      const explicitDependencies = allComponents[alias].inputs.dependsOn || [];
      for (const explicitDependency of explicitDependencies) {
        if (!allComponents[explicitDependency]) {
          throw new ServerlessError(
            `The service "${explicitDependency}" referenced in "dependsOn" of "${alias}" does not exist`,
            'REFERENCED_COMPONENT_DOES_NOT_EXIST'
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
    this.context.output.log();
    this.context.output.log(`Deploying to stage ${this.context.stage}`);

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
    this.context.output.log();
    this.context.output.log(`Removing stage ${this.context.stage}`);

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

  async refreshOutputs() {
    this.context.output.log();
    this.context.output.log('Refreshing outputs');

    Object.keys(this.allComponents).forEach((componentName) => {
      this.context.progresses.add(componentName);
    });

    // We have to execute it in graph similar to deploy as some outputs might be needed
    // to refresh outputs of components deeper in the dependency tree
    await this.executeComponentsGraph({ method: 'refreshOutputs' });

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

  async info(options) {
    await this.invokeComponentsInParallel('info', options);
  }

  async outputs(options = {}) {
    let outputs;
    if (options.componentName) {
      outputs = await this.context.stateStorage.readComponentOutputs(options.componentName);
    } else {
      outputs = await this.context.stateStorage.readComponentsOutputs();
      if (isEmpty(outputs)) {
        throw new ServerlessError(
          'Could not find any deployed service.\nYou can deploy the project via "serverless deploy".\nIf the project is already deployed, you can synchronize your local state via "serverless refresh-outputs".',
          'NO_DEPLOYED_SERVICES_FOUND'
        );
      }
    }

    this.context.renderOutputs(outputs);
  }

  async invokeGlobalCommand(command, options) {
    const globalCommands = ['deploy', 'remove', 'info', 'logs', 'outputs', 'refresh-outputs'];
    // Specific error messages for popular Framework commands
    if (command === 'package') {
      throw new ServerlessError(
        `"package" is not a global command in Serverless Framework Compose.\nAvailable global commands: ${globalCommands.join(
          ', '
        )}.\nYou can package each Serverless Framework service by running "serverless <service-name>:${command}".`,
        'COMMAND_NOT_FOUND'
      );
    }
    if (command === 'invoke') {
      throw new ServerlessError(
        `"invoke" is not a global command in Serverless Framework Compose.\nAvailable global commands: ${globalCommands.join(
          ', '
        )}.\nYou can invoke functions by running "serverless <service-name>:invoke --function <function>".`,
        'COMMAND_NOT_FOUND'
      );
    }
    if (command === 'offline') {
      throw new ServerlessError(
        `"offline" is not a global command in Serverless Framework Compose.\nAvailable global commands: ${globalCommands.join(
          ', '
        )}.\nYou can run serverless-offline in each Serverless Framework service by running "serverless <service-name>:${command}".`,
        'COMMAND_NOT_FOUND'
      );
    }
    if (!globalCommands.includes(command)) {
      const extraText = colors.gray(
        `Available commands: ${globalCommands.join(
          ', '
        )}.\nIf this is a service-specific command, run it using the component name: "serverless <service-name>:${command}"`
      );
      throw new ServerlessError(
        `Command "${command}" doesn't exist.\n${extraText}`,
        'COMMAND_NOT_FOUND'
      );
    }
    const method = this.mapCommandToMethodName(command);
    await this[method](options);
  }

  async invokeComponentCommand(componentName, command, options) {
    // We can have commands that do not have to call commands directly on the component,
    // but are global commands that can accept the componentName parameter
    // to filter out data
    const isGlobalComponentCommand = ['outputs'].includes(command);
    let handler;
    if (isGlobalComponentCommand) {
      handler = (opts) => this[command]({ ...opts, componentName });
    } else {
      await this.instantiateComponents();

      const component =
        this.allComponents &&
        this.allComponents[componentName] &&
        this.allComponents[componentName].instance;
      if (component === undefined) {
        throw new ServerlessError(`Unknown service "${componentName}"`, 'COMPONENT_NOT_FOUND');
      }
      component.logVerbose(`Invoking "${command}" on service "${componentName}"`);

      const isDefaultCommand = ['deploy', 'remove', 'logs', 'info'].includes(command);

      if (isDefaultCommand) {
        // Default command defined for all components (deploy, logs, dev, etc.)
        if (!component || !component[command]) {
          throw new ServerlessError(
            `No method "${command}" on service "${componentName}"`,
            'COMPONENT_COMMAND_NOT_FOUND'
          );
        }
        handler = (opts) => component[command](opts);
      } else if (
        (!component || !component.commands || !component.commands[command]) &&
        component.inputs.component === 'serverless-framework'
      ) {
        // Workaround to invoke all custom Framework commands
        // TODO: Support options and validation
        handler = (opts) => component.command(command, opts);
      } else {
        // Custom command: the handler is defined in the component's `commands` property
        if (!component || !component.commands || !component.commands[command]) {
          throw new ServerlessError(
            `No command "${command}" on service ${componentName}`,
            'COMPONENT_COMMAND_NOT_FOUND'
          );
        }
        const commandHandler = component.commands[command].handler;
        handler = (opts) => commandHandler.call(component, opts);
      }
    }

    try {
      await handler(options);
      this.context.componentCommandsOutcomes[componentName] = 'success';
    } catch (e) {
      // If the component has an ongoing progress, we automatically set it to "error"
      if (this.context.progresses.exists(componentName)) {
        this.context.progresses.error(componentName, e);
      } else {
        this.context.output.error(`\n${formatError(e)}`);
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
          this.context.output.error(formatError(e), [instance.id]);
        }
        this.context.componentCommandsOutcomes[instance.id] = 'failure';
      }
    });

    await Promise.all(promises);
  }

  /**
   * @private
   * @param {{method: string, reverse?: boolean}} _
   * @return {Promise<void>}
   */
  async executeComponentsGraph({ method, reverse }) {
    let nodes;
    if (reverse) {
      nodes = this.componentsGraph.sources();
    } else {
      nodes = this.componentsGraph.sinks();
    }

    if (isEmpty(nodes)) {
      return;
    }

    /** @type {Promise<boolean>[]} */
    const promises = [];

    for (const alias of nodes) {
      const componentData = this.componentsGraph.node(alias);

      const fn = async () => {
        const availableOutputs = await this.context.stateStorage.readComponentsOutputs();
        const inputs = resolveObject(this.allComponents[alias].inputs, availableOutputs, method);

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
            throw new ServerlessError(
              `Missing method "${method}" on service "${alias}"`,
              'COMPONENT_COMMAND_NOT_FOUND'
            );
          }

          await component[method]();
          this.context.componentCommandsOutcomes[alias] = 'success';

          return true;
        } catch (e) {
          // If the component has an ongoing progress, we automatically set it to "error"
          if (this.context.progresses.exists(alias)) {
            this.context.progresses.error(alias, e);
          } else {
            this.context.output.error(e);
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
      return;
    }

    for (const alias of nodes) {
      this.componentsGraph.removeNode(alias);
    }

    await this.executeComponentsGraph({ method, reverse });
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

  mapCommandToMethodName(methodName) {
    if (methodName === 'refresh-outputs') {
      return 'refreshOutputs';
    }
    return methodName;
  }
}

module.exports = ComponentsService;
