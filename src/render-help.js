'use strict';

const { version } = require('../package.json');
const Logger = require('./cli/Logger');
const colors = require('./cli/colors');

const commands = [
  {
    command: 'deploy',
    description: 'Deploy all services',
    options: {
      verbose: 'Show verbose logs',
      stage: 'Stage of the service',
    },
  },
  {
    command: 'remove',
    description: 'Remove all services',
    options: {
      verbose: 'Show verbose logs',
      stage: 'Stage of the service',
    },
  },
  {
    command: 'info',
    description: 'Display information about deployed services',
    options: {
      verbose: 'Show verbose logs',
      stage: 'Stage of the service',
    },
  },
  {
    command: 'logs',
    description: 'Output the logs for all services',
    options: {
      verbose: 'Show verbose logs',
      stage: 'Stage of the service',
      tail: 'Tail the log in real time',
    },
  },
  {
    command: 'outputs',
    description: 'Display outputs of deployed services',
    options: {
      stage: 'Stage of the service',
    },
  },
  {
    command: 'refresh-outputs',
    description: 'Refresh the outptus for all services',
    options: {
      verbose: 'Show verbose logs',
      stage: 'Stage of the service',
    },
  },
];

const formatCommand = (command) => {
  const indentFillLength = 25;

  const commandLine = `${command.command} ${' '.repeat(
    indentFillLength - command.command.length
  )} ${colors.darkGray(command.description)}`;
  const optionsLines = Object.entries(command.options).map(
    ([key, desc]) =>
      `  --${key} ${' '.repeat(indentFillLength - 4 - key.length)} ${colors.darkGray(desc)}`
  );
  return `${commandLine}\n${optionsLines.join('\n')}`;
};

module.exports = async () => {
  const logger = new Logger(false);
  logger.log(`serverless-compose v${version}`);
  logger.log();
  logger.log(colors.darkGray('Usage'));
  logger.log();
  logger.log('serverless-compose <command> <options>');
  logger.log('slsc <command> <options>');
  logger.log();
  logger.log(colors.darkGray('Commands'));
  logger.log();

  for (const command of commands) {
    logger.log(formatCommand(command));
    logger.log();
  }

  logger.log(colors.darkGray('Service-specific usage'));
  logger.log();
  logger.log('serverless-compose <command> <options> --service=<service-name>');
  logger.log('slsc <command> <options> --service=<service-name>');
  logger.log();
  logger.log(colors.darkGray('or alternatively'));
  logger.log();
  logger.log('serverless-compose <service-name>:<command>:<sub-command> <options>');
  logger.log('slsc <service-name>:<command>:<sub-command> <options>');
  logger.log();
};
