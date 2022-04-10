'use strict';

const { version } = require('../package.json');
const Output = require('./cli/Output');
const colors = require('./cli/colors');

const commands = [
  {
    command: 'deploy',
    description: 'Deploy all services',
  },
  {
    command: 'remove',
    description: 'Remove all services',
  },
  {
    command: 'info',
    description: 'Display information about deployed services',
  },
  {
    command: 'logs',
    description: 'Output the logs for all services',
    options: {
      tail: 'Tail the log in real time',
    },
  },
  {
    command: 'outputs',
    description: 'Display outputs of deployed services',
  },
  {
    command: 'refresh-outputs',
    description: 'Refresh the outptus for all services',
  },
];

function formatLine(commandOrOption, description) {
  const indentFillLength = 25;
  const spacing = ' '.repeat(indentFillLength - commandOrOption.length);
  return `${commandOrOption} ${spacing} ${colors.darkGray(description)}`;
}

module.exports = async () => {
  const output = new Output(false);
  output.writeText(`Serverless Compose v${version}`);
  output.writeText();
  output.writeText(colors.darkGray('Usage'));
  output.writeText('serverless-compose <command> <options>');
  output.writeText('slsc <command> <options>');
  output.writeText();
  output.writeText(colors.darkGray('Service-specific commands'));
  output.writeText('serverless-compose <command> <options> --service=<service-name>');
  output.writeText(colors.darkGray('or the shortcut:'));
  output.writeText('serverless-compose <service-name>:<command> <options>');
  output.writeText();
  output.writeText(colors.darkGray('Global options'));
  output.writeText(formatLine('--verbose', 'Enable verbose logs'));
  output.writeText(formatLine('--stage', 'Stage of the service'));
  output.writeText();
  output.writeText(colors.darkGray('Commands'));

  for (const command of commands) {
    output.writeText(formatLine(command.command, command.description));
    Object.entries(command.options ?? {}).forEach(([key, desc]) => {
      output.writeText(formatLine(`  --${key}`, desc));
    });
  }
  output.writeText();
};
