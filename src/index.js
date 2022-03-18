'use strict';

// Setup log writing
require('@serverless/utils/log-reporters/node');

const path = require('path');
const args = require('minimist')(process.argv.slice(2));
const traverse = require('traverse');
const { clone } = require('ramda');
const utils = require('./utils');
const renderHelp = require('./render-help');
const Context = require('./Context');
const Component = require('./Component');
const ComponentsService = require('./ComponentsService');
const generateTelemetryPayload = require('./utils/telemetry/generate-payload');
const storeTelemetryLocally = require('./utils/telemetry/store-locally');
const sendTelemetry = require('./utils/telemetry/send');
const ServerlessError = require('./serverless-error');

// Simplified support only for yml
const getServerlessFile = (dir) => {
  const ymlFilePath = path.join(dir, 'serverless-compose.yml');
  const yamlFilePath = path.join(dir, 'serverless-compose.yaml');

  if (utils.fileExistsSync(ymlFilePath)) {
    return utils.readFileSync(ymlFilePath);
  }
  if (utils.fileExistsSync(yamlFilePath)) {
    return utils.readFileSync(yamlFilePath);
  }

  return false;
};

const isComponentsTemplate = (serverlessFile) => {
  if (typeof serverlessFile !== 'object') {
    return false;
  }

  // make sure it's NOT a framework file
  if (serverlessFile.provider && serverlessFile.provider.name) {
    return false;
  }

  // make sure it IS a serverless-compose file
  if (serverlessFile.services) {
    return true;
  }

  return false;
};

const getConfiguration = async (template) => {
  if (typeof template === 'string') {
    if (
      (!utils.isJsonPath(template) && !utils.isYamlPath(template)) ||
      !(await utils.fileExists(template))
    ) {
      throw new ServerlessError(
        'the referenced template path does not exist',
        'REFERENCED_TEMPLATE_PATH_DOES_NOT_EXIST'
      );
    }

    return utils.readFile(template);
  } else if (typeof template !== 'object') {
    throw new ServerlessError(
      'the template input could either be an object, or a string path to a template file',
      'INVALID_TEMPLATE_FORMAT'
    );
  }
  return template;
};

// For now, only supported variable is `${sls:stage}`;
const resolveConfigurationVariables = async (configuration, stage) => {
  const slsStageRegex = /\${sls:stage}/g;
  let variableResolved = false;
  const resolvedConfiguration = traverse(configuration).forEach(function (value) {
    const matches = typeof value === 'string' ? value.match(slsStageRegex) : null;
    if (matches) {
      let newValue = value;
      for (const match of matches) {
        variableResolved = true;
        newValue = newValue.replace(match, stage);
      }
      this.update(newValue);
    }
  });
  if (variableResolved) {
    return resolveConfigurationVariables(resolvedConfiguration);
  }
  return resolvedConfiguration;
};

const runComponents = async () => {
  if (args.help || args._[0] === 'help') {
    await renderHelp();
    return;
  }

  let method = args._;
  if (!method) {
    await renderHelp();
    return;
  }
  method = method.join(':');

  const serverlessFile = getServerlessFile(process.cwd());

  if (!serverlessFile) {
    throw new ServerlessError(
      'No serverless-compose.yml file found.',
      'CONFIGURATION_FILE_NOT_FOUND'
    );
  }

  const options = args;

  let componentName;
  if (options.service) {
    componentName = options.service;
    delete options.service;
  } else if (method.includes(':')) {
    let methods;
    [componentName, ...methods] = method.split(':');
    method = methods.join(':');
  }
  delete options._; // remove the method name if any

  if (!isComponentsTemplate(serverlessFile)) {
    throw new ServerlessError(
      'serverless-compose.yml file does not contain valid serverless-compose configuration',
      'INVALID_CONFIGURATION'
    );
  }

  const contextConfig = {
    root: process.cwd(),
    stateRoot: path.join(process.cwd(), '.serverless'),
    verbose: options.verbose,
    stage: options.stage || 'dev',
    appName: serverlessFile.name,
  };

  const context = new Context(contextConfig);
  await context.init();
  const configuration = await getConfiguration(serverlessFile);
  await resolveConfigurationVariables(configuration, context.stage);

  // For telemetry we want to keep the configuration that has references to components outputs unresolved
  // So we can properly count it
  const configurationForTelemetry = clone(configuration);

  try {
    const componentsService = new ComponentsService(context, configuration);
    await componentsService.init();

    if (componentName) {
      await componentsService.invokeComponentCommand(componentName, method, options);
    } else {
      if (typeof componentsService[method] !== 'function') {
        throw new ServerlessError(`Command ${method} not found`, 'COMMAND_NOT_FOUND');
      }
      await componentsService[method](options);
    }

    storeTelemetryLocally(
      {
        ...generateTelemetryPayload({
          configuration: configurationForTelemetry,
          options,
          command: method,
          componentName,
          context,
        }),
      },
      context
    );
    await sendTelemetry(context);
    context.shutdown();

    // If at least one of the internal commands failed, we want to exit with error code 1
    if (Object.values(context.componentCommandsOutcomes).includes('failure')) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (e) {
    context.logger.error(e);
    storeTelemetryLocally(
      {
        ...generateTelemetryPayload({
          configuration: configurationForTelemetry,
          options,
          command: method,
          componentName,
          context,
          error: e,
        }),
      },
      context
    );
    await sendTelemetry(context);
    process.exit(1);
  }
};

module.exports = {
  runComponents,
  Component,
  Context,
};
