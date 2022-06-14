'use strict';

const ci = require('ci-info');
const userConfig = require('@serverless/utils/config');
const traverse = require('traverse');
const tokenizeException = require('../tokenize-exception');
const resolveErrorLocation = require('../resolve-error-location');

/**
 * @param {any} _
 * @return {any}
 */
module.exports = ({
  command,
  options,
  configuration,
  componentName,
  context,
  error,
  interruptSignal,
}) => {
  let commandDurationMs;

  if (EvalError.$composeCommandStartTime) {
    const diff = process.hrtime(EvalError.$composeCommandStartTime);
    // First element is in seconds and second in nanoseconds
    commandDurationMs = Math.floor(diff[0] * 1000 + diff[1] / 1000000);
  }

  const ciName = (() => {
    if (process.env.SERVERLESS_CI_CD) {
      return 'Serverless CI/CD';
    }

    if (process.env.SEED_APP_NAME) {
      return 'Seed';
    }

    if (ci.isCI) {
      if (ci.name) {
        return ci.name;
      }
      return 'unknown';
    }
    return null;
  })();
  let timezone;

  try {
    timezone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // Pass silently
  }

  const usedVersions = (() => {
    return {
      '@serverless/compose': require('../../../package').version,
    };
  })();

  const componentsOutcomes = context ? Object.values(context.componentCommandsOutcomes) : [];

  const outcome = (() => {
    if (interruptSignal) return 'interrupt';
    if (error) return 'failure';
    if (componentsOutcomes.includes('failure')) return 'failure';
    if (componentsOutcomes.includes('success')) return 'success';
    if (componentsOutcomes.includes('skip')) return 'skip';
    return 'unrecognized';
  })();

  const commandType = componentName ? 'single' : 'global';

  const stage = (options && options.stage) || 'dev';

  const payload = {
    command,
    commandType,
    outcome,
    componentsOutcomes,
    cliName: '@serverless/compose',
    ciName,
    commandOptionNames: options ? Object.keys(options).filter((key) => key !== '_') : [],
    frameworkLocalUserId: userConfig.get('frameworkId'),
    interruptSignal,
    stage,
    timestamp: Date.now(),
    timezone,
    versions: usedVersions,
  };

  if (context) {
    payload.hasEnabledVerboseInteractively = context.hasEnabledVerboseInteractively;
  }

  if (commandDurationMs != null) {
    payload.commandDurationMs = commandDurationMs;
  }

  if (commandType === 'single') {
    payload.singleCommandType = options.service ? 'withCliOption' : 'withSemicolon';
  }

  if (configuration) {
    const variablesReferenceCount = (() => {
      const regex = /\${\w+\.\w+}/g;
      let referenceCount = 0;
      traverse(configuration).forEach((value) => {
        const matches = typeof value === 'string' ? value.match(regex) : null;
        if (matches) {
          referenceCount += matches.length;
        }
      });
      return referenceCount;
    })();

    payload.config = {
      componentsOutputsVariablesCount: variablesReferenceCount,
      components: Object.values(configuration.services).map((serviceDefinition) => {
        const dependsOnCount = (() => {
          if (!serviceDefinition.dependsOn) return 0;
          if (typeof serviceDefinition.dependsOn === 'string') return 1;
          return serviceDefinition.dependsOn.length;
        })();
        return {
          type: serviceDefinition.component || 'serverless-framework',
          dependsOnCount,
          paramsCount: Object.values(serviceDefinition.params || {}).length,
        };
      }),
    };

    const commandTargetComponents = (() => {
      if (componentName) {
        if (!configuration.services[componentName]) {
          return ['unknown'];
        }
        return [configuration.services[componentName].component || 'serverless-framework'];
      }
      return Object.values(configuration.services).map(
        (serviceDefinition) => serviceDefinition.component || 'serverless-framework'
      );
    })();

    payload.commandTargetComponents = commandTargetComponents;

    const stateStorageType = (() => {
      if (typeof configuration.state === 'string') {
        return configuration.state;
      }

      if (configuration.state && configuration.state.backend) {
        return configuration.state.backend;
      }

      return 'local';
    })();

    payload.stateStorageType = stateStorageType;
  }

  if (error) {
    const exceptionTokens = tokenizeException(error);
    const isUserError = exceptionTokens.isUserError;

    const failureReason = { kind: isUserError ? 'user' : 'programmer', code: exceptionTokens.code };
    if (!isUserError || !exceptionTokens.code) {
      failureReason.location = resolveErrorLocation(exceptionTokens);
    }
    payload.failureReason = failureReason;
  }

  return payload;
};
