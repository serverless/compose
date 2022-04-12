'use strict';

const path = require('path');
const ServerlessError = require('../serverless-error');

function validateConfiguration(configuration, configurationPath) {
  const configurationFilename = path.basename(configurationPath);
  if (typeof configuration !== 'object') {
    throw new ServerlessError(
      `Resolved "${configurationFilename}" does not contain valid Serverless Compose configuration.\n` +
        'Read about Serverless Compose in the documentation: https://github.com/serverless/compose',
      'INVALID_CONFIGURATION'
    );
  }

  if (!configuration.name || !configuration.services) {
    throw new ServerlessError(
      `Invalid configuration: "${configurationFilename}" must contain "name" and "services" properties.\n` +
        'Read about Serverless Compose configuration in the documentation: https://github.com/serverless/compose',
      'INVALID_CONFIGURATION'
    );
  }

  // Provide a targeted error message if users use Framework options
  const frameworkConfigKeys = [
    'service',
    'provider',
    'functions',
    'params',
    'frameworkVersion',
    'useDotenv',
    'package',
    'layers',
    'resources',
    'custom',
  ];
  frameworkConfigKeys.forEach((key) => {
    if (key in configuration) {
      throw new ServerlessError(
        `Invalid property "${key}" in "${configurationFilename}".\n` +
          'This is a Serverless Framework option (serverless.yml) that is not supported in serverless-compose.yml.\n' +
          'You can search and/or open feature requests here: https://github.com/serverless/compose',
        'INVALID_CONFIGURATION'
      );
    }
  });

  const extraProperties = Object.keys(configuration).filter(
    (key) => key !== 'name' && key !== 'services'
  );
  if (extraProperties.length > 0) {
    throw new ServerlessError(
      `Unrecognized property ${extraProperties.join(', ')} in "${configurationFilename}".\n` +
        'Read about Serverless Compose configuration in the documentation: https://github.com/serverless/compose',
      'INVALID_CONFIGURATION'
    );
  }
}

module.exports = validateConfiguration;
