'use strict';

const ServerlessError = require('../serverless-error');

function validateConfiguration(configuration) {
  if (typeof configuration !== 'object') {
    // As the default will be `serverless-compose.yml`, let's provide users with a more actionable error message,
    // Even if we support more configuration formats
    throw new ServerlessError(
      'serverless-compose.yml does not contain valid Serverless Compose configuration.\n' +
        'Read about Serverless Compose in the documentation: https://github.com/serverless/compose',
      'INVALID_CONFIGURATION'
    );
  }

  if (!configuration.name || !configuration.services) {
    // As the default will be `serverless-compose.yml`, let's provide users with a more actionable error message,
    // Even if we support more configuration formats
    throw new ServerlessError(
      'Invalid configuration: serverless-compose.yml must contain "name" and "services" properties.\n' +
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
      // As the default will be `serverless-compose.yml`, let's provide users with a more actionable error message,
      // Even if we support more configuration formats
      throw new ServerlessError(
        `Invalid property "${key}" in serverless-compose.yml.\n` +
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
    // As the default will be `serverless-compose.yml`, let's provide users with a more actionable error message,
    // Even if we support more configuration formats
    throw new ServerlessError(
      `Unrecognized property ${extraProperties.join(', ')} in serverless-compose.yml.\n` +
        'Read about Serverless Compose configuration in the documentation: https://github.com/serverless/compose',
      'INVALID_CONFIGURATION'
    );
  }
}

module.exports = validateConfiguration;
