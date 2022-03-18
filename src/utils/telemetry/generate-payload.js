'use strict';

const ci = require('ci-info');
const userConfig = require('@serverless/utils/config');
const traverse = require('traverse');

module.exports = ({ command, options, configuration, componentName, context, error }) => {
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

  const componentsOutcomes = Object.values(context.componentCommandsOutcomes);

  const outcome = (() => {
    if (error) return 'failure';
    if (componentsOutcomes.includes('failure')) return 'failure';
    if (componentsOutcomes.includes('success')) return 'success';
    if (componentsOutcomes.includes('skip')) return 'skip';
    return 'unrecognized';
  })();

  const payload = {
    command,
    commandType: componentName ? 'single' : 'global',
    outcome,
    componentsOutcomes,
    cliName: '@serverless/compose',
    ciName,
    commandOptionNames: Object.keys(options),
    frameworkLocalUserId: userConfig.get('frameworkId'),
    timestamp: Date.now(),
    timezone,
    versions: usedVersions,
  };

  if (commandDurationMs != null) {
    payload.commandDurationMs = commandDurationMs;
  }

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
        type: serviceDefinition.type || 'serverless-framework',
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
      return [configuration.services[componentName].type || 'serverless-framework'];
    }
    return Object.values(configuration.services).map(
      (serviceDefinition) => serviceDefinition.type || 'serverless-framework'
    );
  })();

  payload.commandTargetComponents = commandTargetComponents;

  return payload;
};
