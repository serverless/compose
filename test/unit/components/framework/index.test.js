'use strict';

const proxyquire = require('proxyquire');
const chai = require('chai');
const sinon = require('sinon');
const Context = require('../../../../src/Context');
const ComponentContext = require('../../../../src/ComponentContext');
const { validateComponentInputs } = require('../../../../src/configuration/validate');
const { configSchema } = require('../../../../components/framework/configuration');
const ServerlessFramework = require('../../../../components/framework');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = require('chai').expect;

/**
 * @returns {Promise<ComponentContext>}
 */
const getContext = async () => {
  const contextConfig = {
    root: process.cwd(),
    stage: 'dev',
    disableIO: true,
    configuration: {},
  };
  const context = new Context(contextConfig);
  await context.init();
  const componentContext = new ComponentContext('id', context);
  await componentContext.init();
  return componentContext;
};

describe('test/unit/components/framework/index.test.js', () => {
  it('correctly handles deploy', async () => {
    const spawnStub = sinon.stub().returns({
      on: (arg, cb) => {
        if (arg === 'close') cb(0);
      },
      stdout: {
        on: (arg, cb) => {
          const data = 'region: us-east-1\n\nStack Outputs:\n  Key: Output';
          if (arg === 'data') cb(data);
        },
      },
      kill: () => {},
    });
    const FrameworkComponent = proxyquire('../../../../components/framework/index.js', {
      'cross-spawn': spawnStub,
    });

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    context.state.detectedFrameworkVersion = '9.9.9';
    await component.deploy();

    expect(spawnStub).to.be.calledTwice;
    expect(spawnStub.getCall(0).args[0]).to.equal('serverless');
    expect(spawnStub.getCall(0).args[1]).to.deep.equal(['deploy', '--stage', 'dev']);
    expect(spawnStub.getCall(0).args[2].cwd).to.equal('path');
    expect(spawnStub.getCall(1).args[0]).to.equal('serverless');
    expect(spawnStub.getCall(1).args[1]).to.deep.equal(['info', '--verbose', '--stage', 'dev']);
    expect(spawnStub.getCall(1).args[2].cwd).to.equal('path');
    expect(context.state).to.deep.equal({ detectedFrameworkVersion: '9.9.9' });
    expect(context.outputs).to.deep.equal({ Key: 'Output' });
  });

  it('correctly handles package', async () => {
    const spawnStub = sinon.stub().returns({
      on: (arg, cb) => {
        if (arg === 'close') cb(0);
      },
      stdout: {
        on: (arg, cb) => {
          const data = 'region: us-east-1\n\nStack Outputs:\n  Key: Output';
          if (arg === 'data') cb(data);
        },
      },
      kill: () => {},
    });
    const FrameworkComponent = proxyquire('../../../../components/framework/index.js', {
      'cross-spawn': spawnStub,
    });

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    context.state.detectedFrameworkVersion = '9.9.9';
    await component.package();

    expect(spawnStub).to.be.calledOnce;
    expect(spawnStub.getCall(0).args[0]).to.equal('serverless');
    expect(spawnStub.getCall(0).args[1]).to.deep.equal(['package', '--stage', 'dev']);
    expect(spawnStub.getCall(0).args[2].cwd).to.equal('path');
    expect(context.state).to.deep.equal({ detectedFrameworkVersion: '9.9.9' });
    expect(context.outputs).to.deep.equal({ Key: 'Output' });
  });

  it('correctly handles refresh-outputs', async () => {
    const spawnStub = sinon.stub().returns({
      on: (arg, cb) => {
        if (arg === 'close') cb(0);
      },
      stdout: {
        on: (arg, cb) => {
          const data = 'region: us-east-1\n\nStack Outputs:\n  Key: Output';
          if (arg === 'data') cb(data);
        },
      },
      kill: () => {},
    });
    const FrameworkComponent = proxyquire('../../../../components/framework/index.js', {
      'cross-spawn': spawnStub,
    });

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    context.state.detectedFrameworkVersion = '9.9.9';
    await component.refreshOutputs();

    expect(spawnStub).to.be.calledOnce;
    expect(spawnStub.getCall(0).args[0]).to.equal('serverless');
    expect(spawnStub.getCall(0).args[1]).to.deep.equal(['info', '--verbose', '--stage', 'dev']);
    expect(spawnStub.getCall(0).args[2].cwd).to.equal('path');
    expect(context.state).to.deep.equal({ detectedFrameworkVersion: '9.9.9' });
    expect(context.outputs).to.deep.equal({ Key: 'Output' });
  });

  it('correctly recognizes region in inputs', async () => {
    const spawnStub = sinon.stub().returns({
      on: (arg, cb) => {
        if (arg === 'close') cb(0);
      },
      stdout: {
        on: (arg, cb) => {
          const data = 'region: us-east-1\n\nStack Outputs:\n  Key: Output';
          if (arg === 'data') cb(data);
        },
      },
      kill: () => {},
    });
    const FrameworkComponent = proxyquire('../../../../components/framework/index.js', {
      'cross-spawn': spawnStub,
    });

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, {
      path: 'path',
      region: 'eu-central-1',
    });
    context.state.detectedFrameworkVersion = '9.9.9';
    await component.refreshOutputs();

    expect(spawnStub).to.be.calledOnce;
    expect(spawnStub.getCall(0).args[0]).to.equal('serverless');
    expect(spawnStub.getCall(0).args[1]).to.deep.equal([
      'info',
      '--verbose',
      '--stage',
      'dev',
      '--region',
      'eu-central-1',
    ]);
    expect(spawnStub.getCall(0).args[2].cwd).to.equal('path');
    expect(context.state).to.deep.equal({ detectedFrameworkVersion: '9.9.9' });
    expect(context.outputs).to.deep.equal({ Key: 'Output' });
  });

  it('correctly recognizes config in inputs', async () => {
    const spawnStub = sinon.stub().returns({
      on: (arg, cb) => {
        if (arg === 'close') cb(0);
      },
      stdout: {
        on: (arg, cb) => {
          const data = 'region: us-east-1\n\nStack Outputs:\n  Key: Output';
          if (arg === 'data') cb(data);
        },
      },
      kill: () => {},
    });
    const FrameworkComponent = proxyquire('../../../../components/framework/index.js', {
      'cross-spawn': spawnStub,
    });

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, {
      path: 'path',
      config: 'different.yml',
    });
    context.state.detectedFrameworkVersion = '9.9.9';
    await component.refreshOutputs();

    expect(spawnStub).to.be.calledOnce;
    expect(spawnStub.getCall(0).args[0]).to.equal('serverless');
    expect(spawnStub.getCall(0).args[1]).to.deep.equal([
      'info',
      '--verbose',
      '--stage',
      'dev',
      '--config',
      'different.yml',
    ]);
    expect(spawnStub.getCall(0).args[2].cwd).to.equal('path');
    expect(context.state).to.deep.equal({ detectedFrameworkVersion: '9.9.9' });
    expect(context.outputs).to.deep.equal({ Key: 'Output' });
  });

  it('correctly set compose-specific specific env vars', async () => {
    const spawnStub = sinon.stub().returns({
      on: (arg, cb) => {
        if (arg === 'close') cb(0);
      },
      stdout: {
        on: (arg, cb) => {
          const data = 'region: us-east-1\n\nStack Outputs:\n  Key: Output';
          if (arg === 'data') cb(data);
        },
      },
      kill: () => {},
    });
    const FrameworkComponent = proxyquire('../../../../components/framework/index.js', {
      'cross-spawn': spawnStub,
    });

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    context.state.detectedFrameworkVersion = '9.9.9';
    await component.refreshOutputs();

    expect(spawnStub).to.be.calledOnce;
    expect(spawnStub.getCall(0).args[2].env.SLS_DISABLE_AUTO_UPDATE).to.equal('1');
    expect(spawnStub.getCall(0).args[2].env.SLS_COMPOSE).to.equal('1');
  });

  it('correctly handles refresh-outputs with malformed info outputs', async () => {
    const spawnStub = sinon.stub().returns({
      on: (arg, cb) => {
        if (arg === 'close') cb(0);
      },
      stdout: {
        on: (arg, cb) => {
          // Simulate the output we get with Serverless Domain Manager
          // https://github.com/serverless/compose/issues/105
          const data =
            'region: us-east-1\n\n' +
            'Stack Outputs:\n' +
            '  Key: Output\n' +
            'Serverless Domain Manager:\n' +
            '  Domain Name: example.com\n' +
            '  ------------------------';
          if (arg === 'data') cb(data);
        },
      },
      kill: () => {},
    });
    const FrameworkComponent = proxyquire('../../../../components/framework/index.js', {
      'cross-spawn': spawnStub,
    });

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    context.state.detectedFrameworkVersion = '9.9.9';
    await component.refreshOutputs();

    expect(spawnStub).to.be.calledOnce;
    expect(spawnStub.getCall(0).args[0]).to.equal('serverless');
    expect(spawnStub.getCall(0).args[1]).to.deep.equal(['info', '--verbose', '--stage', 'dev']);
    expect(spawnStub.getCall(0).args[2].cwd).to.equal('path');
    expect(context.state).to.deep.equal({ detectedFrameworkVersion: '9.9.9' });
    expect(context.outputs).to.deep.equal({ Key: 'Output' });
  });

  it('correctly handles remove', async () => {
    const spawnStub = sinon.stub().returns({
      on: (arg, cb) => {
        if (arg === 'close') cb(0);
      },
      kill: () => {},
    });

    const FrameworkComponent = proxyquire('../../../../components/framework/index.js', {
      'cross-spawn': spawnStub,
    });

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    context.state = {
      key: 'val',
      detectedFrameworkVersion: '9.9.9',
    };
    context.outputs = {
      outputkey: 'outputval',
    };

    await component.remove();

    expect(spawnStub).to.be.calledOnce;
    expect(spawnStub.getCall(0).args[0]).to.equal('serverless');
    expect(spawnStub.getCall(0).args[1]).to.deep.equal(['remove', '--stage', 'dev']);
    expect(spawnStub.getCall(0).args[2].cwd).to.equal('path');
    expect(context.state).to.deep.equal({});
    expect(context.outputs).to.deep.equal({});
  });

  it('correctly handles command', async () => {
    const spawnStub = sinon.stub().returns({
      on: (arg, cb) => {
        if (arg === 'close') cb(0);
      },
      kill: () => {},
    });

    const FrameworkComponent = proxyquire('../../../../components/framework/index.js', {
      'cross-spawn': spawnStub,
    });

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'custom-path' });
    context.state.detectedFrameworkVersion = '9.9.9';

    await component.command('print', { key: 'val', flag: true, o: 'shortoption' });

    expect(spawnStub).to.be.calledOnce;
    expect(spawnStub.getCall(0).args[0]).to.equal('serverless');
    expect(spawnStub.getCall(0).args[1]).to.deep.equal([
      'print',
      '--key=val',
      '--flag',
      '-o',
      'shortoption',
      '--stage',
      'dev',
    ]);
    expect(spawnStub.getCall(0).args[2].cwd).to.equal('custom-path');
  });

  it('correctly ignores `stage` from options to not duplicate it when executing command', async () => {
    const spawnStub = sinon.stub().returns({
      on: (arg, cb) => {
        if (arg === 'close') cb(0);
      },
      kill: () => {},
    });

    const FrameworkComponent = proxyquire('../../../../components/framework/index.js', {
      'cross-spawn': spawnStub,
    });

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'custom-path' });
    context.state.detectedFrameworkVersion = '9.9.9';

    await component.command('print', { key: 'val', flag: true, stage: 'dev' });

    expect(spawnStub).to.be.calledOnce;
    expect(spawnStub.getCall(0).args[1]).to.deep.equal([
      'print',
      '--key=val',
      '--flag',
      '--stage',
      'dev',
    ]);
  });

  it('reports detected unsupported framework version', async () => {
    const spawnExtStub = sinon.stub().resolves({
      stdoutBuffer: Buffer.from('Framework Core: 2.1.0'),
    });

    const FrameworkComponent = proxyquire('../../../../components/framework/index.js', {
      'child-process-ext/spawn': spawnExtStub,
    });

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'foo' });
    await expect(component.deploy()).to.eventually.be.rejectedWith(
      'The installed version of Serverless Framework (2.1.0) is not supported by Compose. Please upgrade Serverless Framework to a version greater or equal to "3.7.7"'
    );
  });

  it('correctly handles logs for component with functions', async () => {
    const spawnStub = sinon.stub().returns({
      on: (arg, cb) => {
        if (arg === 'close') cb(0);
      },
      stdout: {
        on: (arg, cb) => {
          const data =
            'functions:\n  hello:\n    handler: handler.hello\n  other:\n    handler: handler.other';
          if (arg === 'data') cb(data);
        },
      },
      kill: () => {},
    });
    const FrameworkComponent = proxyquire('../../../../components/framework/index.js', {
      'cross-spawn': spawnStub,
    });

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    context.state.detectedFrameworkVersion = '9.9.9';
    await component.logs({});

    expect(spawnStub).to.be.calledThrice;
    expect(spawnStub.getCall(0).args[0]).to.equal('serverless');
    expect(spawnStub.getCall(0).args[1]).to.deep.equal(['print', '--stage', 'dev']);
    expect(spawnStub.getCall(1).args[0]).to.equal('serverless');
    expect(spawnStub.getCall(1).args[1]).to.deep.equal([
      'logs',
      '--function',
      'hello',
      '--stage',
      'dev',
    ]);
    expect(spawnStub.getCall(2).args[0]).to.equal('serverless');
    expect(spawnStub.getCall(2).args[1]).to.deep.equal([
      'logs',
      '--function',
      'other',
      '--stage',
      'dev',
    ]);
  });

  it('correctly handles logs for component without functions', async () => {
    const spawnStub = sinon.stub().returns({
      on: (arg, cb) => {
        if (arg === 'close') cb(0);
      },
      stdout: {
        on: (arg, cb) => {
          const data = 'provider:\n  name: aws';
          if (arg === 'data') cb(data);
        },
      },
      kill: () => {},
    });
    const FrameworkComponent = proxyquire('../../../../components/framework/index.js', {
      'cross-spawn': spawnStub,
    });

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    context.state.detectedFrameworkVersion = '9.9.9';
    await component.logs({});

    expect(spawnStub).to.be.calledOnce;
    expect(spawnStub.getCall(0).args[0]).to.equal('serverless');
    expect(spawnStub.getCall(0).args[1]).to.deep.equal(['print', '--stage', 'dev']);
  });

  it('correctly handles tail option for logs', async () => {
    const spawnStub = sinon.stub().returns({
      on: (arg, cb) => {
        if (arg === 'close') cb(0);
      },
      stdout: {
        on: (arg, cb) => {
          const data = 'functions:\n  hello:\n    handler: handler.hello';
          if (arg === 'data') cb(data);
        },
      },
      kill: () => {},
    });
    const FrameworkComponent = proxyquire('../../../../components/framework/index.js', {
      'cross-spawn': spawnStub,
    });

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    context.state.detectedFrameworkVersion = '9.9.9';
    await component.logs({ tail: true });

    expect(spawnStub).to.be.calledTwice;
    expect(spawnStub.getCall(0).args[0]).to.equal('serverless');
    expect(spawnStub.getCall(0).args[1]).to.deep.equal(['print', '--stage', 'dev']);
    expect(spawnStub.getCall(1).args[0]).to.equal('serverless');
    expect(spawnStub.getCall(1).args[1]).to.deep.equal([
      'logs',
      '--function',
      'hello',
      '--tail',
      '--stage',
      'dev',
    ]);
  });

  it('rejects invalid inputs', () => {
    expect(() =>
      validateComponentInputs('id', configSchema, {
        region: 123,
        params: 'foo',
      })
    )
      .to.throw()
      .and.have.property(
        'message',
        'Invalid configuration for component "id":\n' +
          "- must have required property 'path'\n" +
          '- "region": must be string\n' +
          '- "params": must be object'
      );
  });

  it('rejects path that is the root compose path', async () => {
    const context = await getContext();
    expect(() => new ServerlessFramework('id', context, { path: '.' }))
      .to.throw()
      .and.have.property('code', 'INVALID_PATH_IN_SERVICE_CONFIGURATION');
  });
});
