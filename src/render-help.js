'use strict';

const { version } = require('../package.json');
const Logger = require('./cli/Logger');
const colors = require('./cli/colors');

const commands = [
  {
    command: 'deploy',
    description: 'Deploy a components service',
    options: {
      verbose: 'Show verbose logs',
      stage: 'Stage of the service',
    },
  },
  {
    command: 'remove',
    description: 'Remove a components service',
    options: {
      verbose: 'Show verbose logs',
      stage: 'Stage of the service',
    },
  },
  {
    command: 'info',
    description: 'Display information about the components service',
    options: {
      verbose: 'Show verbose logs',
      stage: 'Stage of the service',
    },
  },
  {
    command: 'logs',
    description: 'Output the logs for deployed components service',
    options: {
      verbose: 'Show verbose logs',
      stage: 'Stage of the service',
      tail: 'Tail the log output',
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
  logger.log(`components-v4-beta v${version}`);
  logger.log();
  logger.log(colors.darkGray('Usage'));
  logger.log();
  logger.log('components-v4 <command> <options>');
  logger.log();
  logger.log(colors.darkGray('Commands'));
  logger.log();

  for (const command of commands) {
    logger.log(formatCommand(command));
    logger.log();
  }
};
