'use strict';

// Setup log writing
require('@serverless/utils/log-reporters/node');

const args = require('minimist')(process.argv.slice(2));
const { clone } = require('ramda');
const renderHelp = require('./render-help');
const Context = require('./Context');
const ComponentsService = require('./ComponentsService');
const generateTelemetryPayload = require('./utils/telemetry/generate-payload');
const storeTelemetryLocally = require('./utils/telemetry/store-locally');
const sendTelemetry = require('./utils/telemetry/send');
const handleError = require('./handle-error');
const colors = require('./cli/colors');
const resolveConfigurationVariables = require('./configuration/resolve-variables');
const resolveConfigurationPath = require('./configuration/resolve-path');
const readConfiguration = require('./configuration/read');
const { validateConfiguration } = require('./configuration/validate');
const validateOptions = require('./validate-options');
const processBackendNotificationRequest = require('./utils/process-backend-notification-request');

let options;
let method;
let configurationForTelemetry;
let componentName;
let context;
let optionsForTelemetry;

process.once('uncaughtException', (error) => {
  // Refactor it to not rely heavily on context because it is only needed for logs
  const usedContext = context || new Context({ root: process.cwd() });
  storeTelemetryLocally(
    {
      ...generateTelemetryPayload({
        configuration: configurationForTelemetry,
        options,
        optionsForTelemetry,
        command: method,
        componentName,
        error,
        context: usedContext,
      }),
    },
    usedContext
  );
  handleError(error, usedContext.output);
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
          options: optionsForTelemetry,
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
  optionsForTelemetry = clone(args);

  if (options.service) {
    componentName = options.service;
    delete options.service;
  } else if (method.includes(':')) {
    let methods;
    [componentName, ...methods] = method.split(':');
    method = methods.join(':');
  }
  delete options._; // remove the method name if any

  const configurationPath = await resolveConfigurationPath();
  const configuration = await readConfiguration(configurationPath);
  validateConfiguration(configuration, configurationPath);

  const stage = options.stage || 'dev';
  await resolveConfigurationVariables(configuration, configurationPath, stage);

  const contextConfig = {
    root: process.cwd(),
    verbose: options.verbose,
    stage,
    configuration,
  };

  context = new Context(contextConfig);
  await context.init();

  // For telemetry we want to keep the configuration that has references to components outputs unresolved
  // So we can properly count it
  configurationForTelemetry = clone(configuration);

  validateOptions(options, method);

  try {
    const componentsService = new ComponentsService(context, configuration, options);
    await componentsService.init();

    // Additionally, we're raising the listener default limit by 1 for each component - we might revisit it in the future
    if (componentName) {
      process.setMaxListeners(process.getMaxListeners() + 1);
      await componentsService.invokeComponentCommand(componentName, method, options);
    } else {
      const numOfComponents = Object.keys(componentsService.allComponents).length;
      process.setMaxListeners(process.getMaxListeners() + numOfComponents);
      await componentsService.invokeGlobalCommand(method, options);
    }

    storeTelemetryLocally(
      {
        ...generateTelemetryPayload({
          configuration: configurationForTelemetry,
          options: optionsForTelemetry,
          command: method,
          componentName,
          context,
        }),
      },
      context
    );
    context.shutdown();

    const backendNotificationRequest = await sendTelemetry(context);
    if (backendNotificationRequest && !componentName && method === 'deploy') {
      // Only display notifications on global deploy command
      await processBackendNotificationRequest(backendNotificationRequest, context.output);
    }

    // If at least one of the internal commands failed, we want to exit with error code 1
    if (Object.values(context.componentCommandsOutcomes).includes('failure')) {
      context.output.log();
      context.output.log(colors.gray('Verbose logs are available in ".serverless/compose.log"'));
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (e) {
    handleError(e, context.output);
    storeTelemetryLocally(
      {
        ...generateTelemetryPayload({
          configuration: configurationForTelemetry,
          options: optionsForTelemetry,
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
};
