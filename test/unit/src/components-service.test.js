'use strict';

const path = require('path');
const ComponentsService = require('../../../src/ComponentsService');
const Context = require('../../../src/Context');
const stripAnsi = require('strip-ansi');
const readStream = require('../read-stream');

const expect = require('chai').expect;

const frameworkComponentPath = path.dirname(
  require.resolve('../../../components/framework/index.js')
);

describe('test/unit/src/components-service.test.js', () => {
  let componentsService;
  before(async () => {
    const configuration = {
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
        anotherservice: {
          component: '@foo/bar',
          path: 'another',
          dependsOn: 'consumer',
        },
      },
    };
    const contextConfig = {
      root: process.cwd(),
      stage: 'dev',
      disableIO: true,
      configuration: {},
    };
    const context = new Context(contextConfig);
    await context.init();
    componentsService = new ComponentsService(context, configuration, {});
    await componentsService.init();
  });

  it('has properly resolved components', () => {
    expect(componentsService.allComponents).to.deep.equal({
      anotherservice: {
        dependencies: ['consumer'],
        inputs: {
          component: '@foo/bar',
          dependsOn: 'consumer',
          path: 'another',
        },
        path: '@foo/bar',
      },
      consumer: {
        dependencies: ['resources'],
        inputs: {
          component: 'serverless-framework',
          params: {
            workerQueueArn: '${resources.WorkerQueueArn}',
          },
          path: 'consumer',
        },
        path: frameworkComponentPath,
      },
      resources: {
        dependencies: [],
        inputs: {
          component: 'serverless-framework',
          path: 'resources',
        },
        path: frameworkComponentPath,
      },
    });
  });

  it('has properly resolved components graph', () => {
    expect(componentsService.componentsGraph.nodeCount()).to.equal(3);
    expect(componentsService.componentsGraph.edgeCount()).to.equal(2);
    expect(componentsService.componentsGraph.sinks()).to.deep.equal(['resources']);
    expect(componentsService.componentsGraph.sources()).to.deep.equal(['anotherservice']);
  });

  it('throws an error when configuration has components with the same type and path', async () => {
    const configuration = {
      name: 'test-service',
      services: {
        resources: {
          path: 'resources',
        },
        duplicated: {
          path: 'resources',
          params: {
            workerQueueArn: '${resources.WorkerQueueArn}',
          },
        },
        anotherservice: {
          path: 'another',
          dependsOn: 'consumer',
        },
      },
    };
    const contextConfig = {
      root: process.cwd(),
      stage: 'dev',
      disableIO: true,
      configuration: {},
    };
    const context = new Context(contextConfig);
    await context.init();
    componentsService = new ComponentsService(context, configuration, {});

    await expect(componentsService.init()).to.eventually.be.rejectedWith(
      'Service "resources" has the same "path" as the following services: "duplicated". This is currently not supported because deploying the same service in parallel generates packages in the same ".serverless/" directory which can cause conflicts.'
    );
  });

  it('correctly handles outputs command', async () => {
    const configuration = {
      name: 'test-service',
      services: {
        resources: {
          path: 'resources',
        },
        anotherservice: {
          path: 'another',
          dependsOn: 'consumer',
        },
      },
    };
    const contextConfig = {
      root: process.cwd(),
      stage: 'dev',
      disableIO: true,
      configuration: {},
    };
    const mockedStateStorage = {
      readServiceState: () => ({ id: 123, detectedFrameworkVersion: '9.9.9' }),
      readComponentsOutputs: () => {
        return {
          resources: {
            somethingelse: '123',
          },
          anotherservice: {
            endpoint: 'https://example.com',
            additional: '123',
          },
        };
      },
    };
    const context = new Context(contextConfig);
    await context.init();
    context.stateStorage = mockedStateStorage;
    componentsService = new ComponentsService(context, configuration, {});

    await componentsService.outputs();
    expect(stripAnsi(await readStream(context.output.stdout))).to.equal(
      [
        '',
        'resources: ',
        '  somethingelse: 123',
        'anotherservice: ',
        '  endpoint: https://example.com',
        '  additional: 123',
        '',
      ].join('\n')
    );
  });

  it('correctly handles outputs command for single component', async () => {
    const configuration = {
      name: 'test-service',
      services: {
        resources: {
          path: 'resources',
        },
        anotherservice: {
          path: 'another',
          dependsOn: 'consumer',
        },
      },
    };
    const contextConfig = {
      root: process.cwd(),
      stage: 'dev',
      disableIO: true,
      configuration: {},
    };
    const mockedStateStorage = {
      readServiceState: () => ({ id: 123, detectedFrameworkVersion: '9.9.9' }),
      readComponentOutputs: () => {
        return {
          somethingelse: '123',
        };
      },
    };
    const context = new Context(contextConfig);
    await context.init();
    context.stateStorage = mockedStateStorage;
    componentsService = new ComponentsService(context, configuration, {});

    await componentsService.outputs({ componentName: 'resources' });
    expect(stripAnsi(await readStream(context.output.stdout))).to.equal(
      ['', 'somethingelse: 123', ''].join('\n')
    );
  });
});
