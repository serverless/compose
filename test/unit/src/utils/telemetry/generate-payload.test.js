'use strict';

const expect = require('chai').expect;

const Context = require('../../../../../src/Context');
const ServerlessError = require('../../../../../src/serverless-error');
const generatePayload = require('../../../../../src/utils/telemetry/generate-payload');

const versions = {
  '@serverless/compose': require('../../../../../package').version,
};

describe('test/unit/lib/utils/telemetry/generate-payload.test.js', () => {
  it('generates expected payload', () => {
    const contextConfig = {
      root: process.cwd(),
      stage: 'dev',
      disableIO: true,
    };
    const context = new Context(contextConfig);
    const payload = generatePayload({
      command: 'deploy',
      options: { someoption: 'abc', stage: 'prod' },
      configuration: {
        name: 'test-service',
        services: {
          resources: {
            path: 'resources',
          },
          consumer: {
            path: 'consumer',
            params: {
              workerQueueArn: '${resources.WorkerQueueArn}',
            },
          },
          website: {
            path: 'public',
            component: '@serverless-components/website',
          },
        },
      },
      componentName: 'resources',
      context,
    });
    expect(payload).to.have.property('frameworkLocalUserId');
    delete payload.frameworkLocalUserId;
    expect(payload).to.have.property('timestamp');
    delete payload.timestamp;
    expect(payload).to.have.property('timezone');
    delete payload.timezone;
    expect(payload).to.have.property('ciName');
    delete payload.ciName;

    expect(payload).to.deep.equal({
      cliName: '@serverless/compose',
      command: 'deploy',
      commandOptionNames: ['someoption', 'stage'],
      commandTargetComponents: ['serverless-framework'],
      commandType: 'single',
      componentsOutcomes: [],
      config: {
        components: [
          {
            dependsOnCount: 0,
            paramsCount: 0,
            type: 'serverless-framework',
          },
          {
            dependsOnCount: 0,
            paramsCount: 1,
            type: 'serverless-framework',
          },
          {
            dependsOnCount: 0,
            paramsCount: 0,
            type: '@serverless-components/website',
          },
        ],
        componentsOutputsVariablesCount: 1,
      },
      hasEnabledVerboseInteractively: false,
      interruptSignal: undefined,
      singleCommandType: 'withSemicolon',
      stage: 'prod',
      stateStorageType: 'local',
      outcome: 'unrecognized',
      versions,
    });
  });

  it('recognizes programmer error in telemetry', () => {
    const contextConfig = {
      root: process.cwd(),
      stage: 'dev',
      disableIO: true,
    };
    const context = new Context(contextConfig);
    const error = new Error('some error without code');
    const payload = generatePayload({
      command: 'deploy',
      options: { someoption: 'abc' },
      configuration: {
        name: 'test-service',
        services: {
          resources: {
            path: 'resources',
          },
        },
      },
      componentName: 'resources',
      context,
      error,
    });

    expect(payload.failureReason.kind).to.equal('programmer');
    expect(payload.failureReason).to.have.property('location');
  });

  it('recognizes user error in telemetry', () => {
    const contextConfig = {
      root: process.cwd(),
      stage: 'dev',
      disableIO: true,
    };
    const context = new Context(contextConfig);
    const error = new ServerlessError('some error with code', 'ERROR_CODE');
    const payload = generatePayload({
      command: 'deploy',
      options: { someoption: 'abc' },
      configuration: {
        name: 'test-service',
        services: {
          resources: {
            path: 'resources',
          },
        },
      },
      componentName: 'resources',
      context,
      error,
    });

    expect(payload.failureReason.kind).to.equal('user');
    expect(payload.failureReason.code).to.equal('ERROR_CODE');
  });

  it('recognizes uncaught error in telemetry without configuration', () => {
    const contextConfig = {
      root: process.cwd(),
      disableIO: true,
    };
    const context = new Context(contextConfig);
    const error = new ServerlessError('some error with code', 'ERROR_CODE');
    const payload = generatePayload({
      command: 'deploy',
      context,
      error,
    });

    expect(payload).to.have.property('frameworkLocalUserId');
    delete payload.frameworkLocalUserId;
    expect(payload).to.have.property('timestamp');
    delete payload.timestamp;
    expect(payload).to.have.property('timezone');
    delete payload.timezone;
    expect(payload).to.have.property('ciName');
    delete payload.ciName;

    expect(payload).to.deep.equal({
      cliName: '@serverless/compose',
      command: 'deploy',
      commandOptionNames: [],
      commandType: 'global',
      componentsOutcomes: [],
      hasEnabledVerboseInteractively: false,
      interruptSignal: undefined,
      outcome: 'failure',
      stage: 'dev',
      versions,
      failureReason: {
        code: 'ERROR_CODE',
        kind: 'user',
      },
    });
  });

  it('recognizes hasEnabledVerboseInteractively', () => {
    const contextConfig = {
      root: process.cwd(),
      disableIO: true,
    };
    const context = new Context(contextConfig);
    context.hasEnabledVerboseInteractively = true;
    const payload = generatePayload({
      command: 'deploy',
      context,
    });

    expect(payload.hasEnabledVerboseInteractively).to.be.true;
  });

  it('recognizes s3 state backend', () => {
    const contextConfig = {
      root: process.cwd(),
      disableIO: true,
    };
    const context = new Context(contextConfig);
    const payload = generatePayload({
      command: 'deploy',
      context,
      configuration: {
        services: {},
        state: {
          backend: 's3',
        },
      },
    });

    expect(payload.stateStorageType).to.equal('s3');
  });

  it('recognizes interrupt', () => {
    const contextConfig = {
      root: process.cwd(),
      disableIO: true,
    };
    const interruptSignal = 'SIGINT';
    const context = new Context(contextConfig);
    const payload = generatePayload({
      command: 'deploy',
      context,
      interruptSignal,
    });

    expect(payload).to.have.property('frameworkLocalUserId');
    delete payload.frameworkLocalUserId;
    expect(payload).to.have.property('timestamp');
    delete payload.timestamp;
    expect(payload).to.have.property('timezone');
    delete payload.timezone;
    expect(payload).to.have.property('ciName');
    delete payload.ciName;

    expect(payload).to.deep.equal({
      cliName: '@serverless/compose',
      command: 'deploy',
      commandOptionNames: [],
      commandType: 'global',
      componentsOutcomes: [],
      hasEnabledVerboseInteractively: false,
      outcome: 'interrupt',
      interruptSignal,
      stage: 'dev',
      versions,
    });
  });

  it('properly resolves singleCommandType with option', () => {
    const contextConfig = {
      root: process.cwd(),
      stage: 'dev',
      disableIO: true,
    };
    const context = new Context(contextConfig);
    const payload = generatePayload({
      command: 'deploy',
      options: { someoption: 'abc', service: 'componentName' },
      configuration: {
        name: 'test-service',
        services: {
          resources: {
            path: 'resources',
          },
          consumer: {
            path: 'consumer',
            params: {
              workerQueueArn: '${resources.WorkerQueueArn}',
            },
          },
        },
      },
      componentName: 'resources',
      context,
    });

    expect(payload.singleCommandType).to.equal('withCliOption');
  });
});
