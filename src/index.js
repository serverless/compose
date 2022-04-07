'use strict';

// Setup log writing
require('@serverless/utils/log-reporters/node');

const path = require('path');
const args = require('minimist')(process.argv.slice(2));
const { clone } = require('ramda');
const renderHelp = require('./render-help');
const Context = require('./Context');
const Component = require('./Component');
const ComponentsService = require('./ComponentsService');
const generateTelemetryPayload = require('./utils/telemetry/generate-payload');
const storeTelemetryLocally = require('./utils/telemetry/store-locally');
const sendTelemetry = require('./utils/telemetry/send');
const ServerlessError = require('./serverless-error');
const handleError = require('./handle-error');
const colors = require('./cli/colors');
const {
  readConfigurationFile,
  validateConfiguration,
  resolveConfigurationVariables,
} = require('./configuration/configuration');

let options;
let method;
let configurationForTelemetry;
let componentName;
let context;

process.once('uncaughtException', (error) => {
  // Refactor it to not rely heavily on context because it is only needed for logs
  const usedContext = context || new Context({ root: process.cwd() });
  storeTelemetryLocally(
    {
      ...generateTelemetryPayload({
        configuration: configurationForTelemetry,
        options,
        command: method,
        componentName,
        error,
        context: usedContext,
      }),
    },
    usedContext
  );
  handleError(error, usedContext.logger);
  sendTelemetry(usedContext).then(() => process.exit(1));
});

require('signal-exit/signals').forEach((signal) => {
  process.once(signal, () => {
    // If there's another listener (e.g. we're in deamon context or reading stdin input)
    // then let the other listener decide how process will exit
    const isOtherSigintListener = Boolean(process.listenerCount(signal));
    // Refactor it to not rely heavily on context because it is only needed for logs
    const usedContext = context || new Context({ root: process.cwd() });
    storeTelemetryLocally(
      {
        ...generateTelemetryPayload({
          configuration: configurationForTelemetry,
          options,
          command: method,
          componentName,
          context: usedContext,
          interruptSignal: signal,
        }),
      },
      usedContext
    );
    if (isOtherSigintListener) return;
    // Follow recommendation from signal-exit:
    // https://github.com/tapjs/signal-exit/blob/654117d6c9035ff6a805db4d4acf1f0c820fcb21/index.js#L97-L98
    if (process.platform === 'win32' && signal === 'SIGHUP') signal = 'SIGINT';
    process.kill(process.pid, signal);
  });
});

const runComponents = async () => {
  if (args.help || args._[0] === 'help') {
    await renderHelp();
    return;
  }

  method = args._;
  if (!method) {
    await renderHelp();
    return;
  }
  method = method.join(':');
  options = args;

  if (options.service) {
    componentName = options.service;
    delete options.service;
  } else if (method.includes(':')) {
    let methods;
    [componentName, ...methods] = method.split(':');
    method = methods.join(':');
  }
  delete options._; // remove the method name if any

  const configuration = readConfigurationFile(process.cwd());
  validateConfiguration(configuration);

  const contextConfig = {
    root: process.cwd(),
    stateRoot: path.join(process.cwd(), '.serverless'),
    verbose: options.verbose,
    stage: options.stage || 'dev',
    appName: configuration.name,
  };

  context = new Context(contextConfig);
  await context.init();
  await resolveConfigurationVariables(configuration, context.stage);

  // For telemetry we want to keep the configuration that has references to components outputs unresolved
  // So we can properly count it
  configurationForTelemetry = clone(configuration);

  // Catch early Framework CLI-wide options that aren't supported here
  // Since these are reserved options, we don't even want component-specific commands to support them
  // so we detect these early for _all_ commands.
  const unsupportedGlobalCliOptions = ['debug', 'config', 'param'];
  unsupportedGlobalCliOptions.forEach((option) => {
    if (options[option]) {
      throw new ServerlessError(
        `The "--${option}" option is not supported (yet) in Serverless Compose`,
        'INVALID_CLI_OPTION'
      );
    }
  });

  try {
    const componentsService = new ComponentsService(context, configuration);
    await componentsService.init();

    if (componentName) {
      await componentsService.invokeComponentCommand(componentName, method, options);
    } else {
      await componentsService.invokeGlobalCommand(method, options);
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
      context.logger.log();
      context.logger.log(
        colors.darkGray('Verbose logs are available in ".serverless/compose.log"')
      );
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (e) {
    handleError(e, context.logger);
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
