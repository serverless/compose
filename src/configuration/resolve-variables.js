'use strict';

const traverse = require('traverse');
const ServerlessError = require('../serverless-error');

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

module.exports = resolveConfigurationVariables;
