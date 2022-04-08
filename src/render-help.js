'use strict';

const { version } = require('../package.json');
const Output = require('./cli/Output');
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
  const output = new Output(false);
  output.log(`serverless-compose v${version}`);
  output.log();
  output.log(colors.darkGray('Usage'));
  output.log();
  output.log('serverless-compose <command> <options>');
  output.log('slsc <command> <options>');
  output.log();
  output.log(colors.darkGray('Commands'));
  output.log();

  for (const command of commands) {
    output.log(formatCommand(command));
    output.log();
  }

  output.log(colors.darkGray('Service-specific usage'));
  output.log();
  output.log('serverless-compose <command> <options> --service=<service-name>');
  output.log('slsc <command> <options> --service=<service-name>');
  output.log();
  output.log(colors.darkGray('or alternatively'));
  output.log();
  output.log('serverless-compose <service-name>:<command>:<sub-command> <options>');
  output.log('slsc <service-name>:<command>:<sub-command> <options>');
  output.log();
};
