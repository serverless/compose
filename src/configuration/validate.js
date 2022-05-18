'use strict';

const path = require('path');
const ServerlessError = require('../serverless-error');
const isObject = require('type/object/is');

function validateConfiguration(configuration, configurationPath) {
  const configurationFilename = path.basename(configurationPath);
  if (typeof configuration !== 'object') {
    throw new ServerlessError(
      `Resolved "${configurationFilename}" does not contain valid Compose configuration.\n` +
        'Read about Serverless Framework Compose in the documentation: https://slss.io/docs-compose',
      'INVALID_NON_OBJECT_CONFIGURATION'
    );
  }

  if (!isObject(configuration.services)) {
    throw new ServerlessError(
      `Invalid configuration: "${configurationFilename}" must contain "services" property.\n` +
        'Read about Serverless Framework Compose configuration in the documentation: https://slss.io/docs-compose',
      'INVALID_NON_OBJECT_SERVICES_CONFIGURATION'
    );
  }

  Object.entries(configuration.services).forEach(([key, value]) => {
    if (!isObject(value)) {
      throw new ServerlessError(
        `Invalid configuration: definition of "${key}" service must be an object.\n` +
          'Read about Serverless Framework Compose configuration in the documentation: https://slss.io/docs-compose',
        'INVALID_NON_OBJECT_SERVICE_CONFIGURATION'
      );
    }

    if (!value.path) {
      throw new ServerlessError(
        `Invalid configuration: definition of "${key}" service must contain a "path" property.\n` +
          'Read about Serverless Framework Compose configuration in the documentation: https://slss.io/docs-compose',
        'MISSING_PATH_IN_SERVICE_CONFIGURATION'
      );
    }

    if (path.relative(process.cwd(), value.path) === '') {
      throw new ServerlessError(
        `Definition of "${key}" service must contain a "path" property that does not point to the root directory of Serverless Framework Compose project`,
        'INVALID_PATH_IN_SERVICE_CONFIGURATION'
      );
    }
  });

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
          'You can search and/or open feature requests here: https://slss.io/docs-compose',
        'INVALID_CONFIGURATION'
      );
    }
  });

  const extraProperties = Object.keys(configuration).filter(
    (key) => !new Set(['services', 'state']).has(key)
  );
  if (extraProperties.length > 0) {
    throw new ServerlessError(
      `Unrecognized property ${extraProperties.join(', ')} in "${configurationFilename}".\n` +
        'Read about Serverless Framework Compose configuration in the documentation: https://slss.io/docs-compose',
      'INVALID_CONFIGURATION'
    );
  }
}

module.exports = validateConfiguration;
