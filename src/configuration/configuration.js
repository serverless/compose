'use strict';

const path = require('path');
const traverse = require('traverse');
const utils = require('../utils');
const ServerlessError = require('../serverless-error');

function readConfigurationFile(dir) {
  // Simplified support only for yml
  const ymlFilePath = path.join(dir, 'serverless-compose.yml');
  const yamlFilePath = path.join(dir, 'serverless-compose.yaml');

  if (utils.fileExistsSync(ymlFilePath)) {
    return utils.readFileSync(ymlFilePath);
  }
  if (utils.fileExistsSync(yamlFilePath)) {
    return utils.readFileSync(yamlFilePath);
  }

  throw new ServerlessError('No serverless-compose.yml file found', 'CONFIGURATION_FILE_NOT_FOUND');
}

function validateConfiguration(configuration) {
  if (typeof configuration !== 'object') {
    throw new ServerlessError(
      'serverless-compose.yml does not contain valid Serverless Compose configuration.\n' +
        'Read about Serverless Compose in the documentation: https://github.com/serverless/compose',
      'INVALID_CONFIGURATION'
    );
  }

  if (!configuration.name || !configuration.services) {
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
    throw new ServerlessError(
      `Unrecognized property ${extraProperties.join(', ')} in serverless-compose.yml.\n` +
        'Read about Serverless Compose configuration in the documentation: https://github.com/serverless/compose',
      'INVALID_CONFIGURATION'
    );
  }
}

// For now, only supported variables are `${sls:stage}` and `${env:<key>}`;
// TODO: After merging into Framework CLI, unify the configuration resolution handling with Framework logic
const resolveConfigurationVariables = async (
  configuration,
  stage,
  unrecognizedVariableSources = new Set()
) => {
  const regex = /\${(\w*:[\w\d.-]+)}/g;
  const slsStageRegex = /\${sls:stage}/g;
  const envRegex = /\${env:(\w*[\w.-_]+)}/g;

  let variableResolved = false;
  const resolvedConfiguration = traverse(configuration).forEach(function (value) {
    const matches = typeof value === 'string' ? value.match(regex) : null;
    if (matches) {
      let newValue = value;
      for (const match of matches) {
        if (slsStageRegex.test(match)) {
          variableResolved = true;
          newValue = newValue.replace(match, stage);
        } else if (envRegex.test(match)) {
          const referencedPropertyPath = match.substring(2, match.length - 1).split(':');
          if (process.env[referencedPropertyPath[1]] == null) {
            throw new ServerlessError(
              `The environment variable "${referencedPropertyPath[1]}" is referenced but is not defined`,
              'CANNOT_FIND_ENVIRONMENT_VARIABLE'
            );
          }
          if (match === value) {
            newValue = process.env[referencedPropertyPath[1]];
          } else {
            newValue = value.replace(match, process.env[referencedPropertyPath[1]]);
          }
          variableResolved = true;
        } else {
          const variableSource = match.slice(2).split(':')[0];
          unrecognizedVariableSources.add(variableSource);
        }
      }
      this.update(newValue);
    }
  });
  if (variableResolved) {
    return resolveConfigurationVariables(resolvedConfiguration, stage, unrecognizedVariableSources);
  }
  if (unrecognizedVariableSources.size) {
    throw new ServerlessError(
      `Unrecognized configuration variable sources: "${Array.from(unrecognizedVariableSources).join(
        '", "'
      )}"`,
      'UNRECOGNIZED_VARIABLE_SOURCES'
    );
  }
  return resolvedConfiguration;
};

module.exports = {
  readConfigurationFile,
  validateConfiguration,
  resolveConfigurationVariables,
};
