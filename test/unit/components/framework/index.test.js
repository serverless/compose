'use strict';

const path = require('path');
const proxyquire = require('proxyquire');
const chai = require('chai');
const sinon = require('sinon');
const Context = require('../../../../src/Context');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = require('chai').expect;

const getContext = async () => {
  const contextConfig = {
    root: process.cwd(),
    stateRoot: path.join(process.cwd(), '.serverless'),
    stage: 'dev',
    disableIO: true,
  };
  const context = new Context(contextConfig);
  await context.init();
  return context;
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
    const FrameworkComponent = proxyquire('../../../../components/framework/serverless.js', {
      'cross-spawn': spawnStub,
    });

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    component.state.detectedFrameworkVersion = '9.9.9';
    await component.deploy();

    expect(spawnStub).to.be.calledTwice;
    expect(spawnStub.getCall(0).args[0]).to.equal('serverless');
    expect(spawnStub.getCall(0).args[1]).to.deep.equal(['deploy', '--stage', 'dev']);
    expect(spawnStub.getCall(0).args[2].cwd).to.equal('path');
    expect(spawnStub.getCall(1).args[0]).to.equal('serverless');
    expect(spawnStub.getCall(1).args[1]).to.deep.equal(['info', '--verbose', '--stage', 'dev']);
    expect(spawnStub.getCall(1).args[2].cwd).to.equal('path');
    expect(component.state).to.deep.equal({ detectedFrameworkVersion: '9.9.9' });
    expect(component.outputs).to.deep.equal({ Key: 'Output' });
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
    const FrameworkComponent = proxyquire('../../../../components/framework/serverless.js', {
      'cross-spawn': spawnStub,
    });

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    component.state.detectedFrameworkVersion = '9.9.9';
    await component.refreshOutputs();

    expect(spawnStub).to.be.calledOnce;
    expect(spawnStub.getCall(0).args[0]).to.equal('serverless');
    expect(spawnStub.getCall(0).args[1]).to.deep.equal(['info', '--verbose', '--stage', 'dev']);
    expect(spawnStub.getCall(0).args[2].cwd).to.equal('path');
    expect(component.state).to.deep.equal({ detectedFrameworkVersion: '9.9.9' });
    expect(component.outputs).to.deep.equal({ Key: 'Output' });
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
    const FrameworkComponent = proxyquire('../../../../components/framework/serverless.js', {
      'cross-spawn': spawnStub,
    });

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    component.state.detectedFrameworkVersion = '9.9.9';
    await component.refreshOutputs();

    expect(spawnStub).to.be.calledOnce;
    expect(spawnStub.getCall(0).args[0]).to.equal('serverless');
    expect(spawnStub.getCall(0).args[1]).to.deep.equal(['info', '--verbose', '--stage', 'dev']);
    expect(spawnStub.getCall(0).args[2].cwd).to.equal('path');
    expect(component.state).to.deep.equal({ detectedFrameworkVersion: '9.9.9' });
    expect(component.outputs).to.deep.equal({ Key: 'Output' });
  });

  it('correctly handles remove', async () => {
    const spawnStub = sinon.stub().returns({
      on: (arg, cb) => {
        if (arg === 'close') cb(0);
      },
      kill: () => {},
    });

    const FrameworkComponent = proxyquire('../../../../components/framework/serverless.js', {
      'cross-spawn': spawnStub,
    });

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    component.state = {
      key: 'val',
      detectedFrameworkVersion: '9.9.9',
    };
    component.outputs = {
      outputkey: 'outputval',
    };

    await component.remove();

    expect(spawnStub).to.be.calledOnce;
    expect(spawnStub.getCall(0).args[0]).to.equal('serverless');
    expect(spawnStub.getCall(0).args[1]).to.deep.equal(['remove', '--stage', 'dev']);
    expect(spawnStub.getCall(0).args[2].cwd).to.equal('path');
    expect(component.state).to.deep.equal({});
    expect(component.outputs).to.deep.equal({});
  });

  it('correctly handles command', async () => {
    const spawnStub = sinon.stub().returns({
      on: (arg, cb) => {
        if (arg === 'close') cb(0);
      },
      kill: () => {},
    });

    const FrameworkComponent = proxyquire('../../../../components/framework/serverless.js', {
      'cross-spawn': spawnStub,
    });

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'custom-path' });
    component.state.detectedFrameworkVersion = '9.9.9';

    await component.command('print', { key: 'val', flag: true });

    expect(spawnStub).to.be.calledOnce;
    expect(spawnStub.getCall(0).args[0]).to.equal('serverless');
    expect(spawnStub.getCall(0).args[1]).to.deep.equal([
      'print',
      '--key=val',
      '--flag',
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

    const FrameworkComponent = proxyquire('../../../../components/framework/serverless.js', {
      'cross-spawn': spawnStub,
    });

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'custom-path' });
    component.state.detectedFrameworkVersion = '9.9.9';

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

    const FrameworkComponent = proxyquire('../../../../components/framework/serverless.js', {
      'child-process-ext/spawn': spawnExtStub,
    });

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, {});
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
    const FrameworkComponent = proxyquire('../../../../components/framework/serverless.js', {
      'cross-spawn': spawnStub,
    });

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    component.state.detectedFrameworkVersion = '9.9.9';
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
    const FrameworkComponent = proxyquire('../../../../components/framework/serverless.js', {
      'cross-spawn': spawnStub,
    });

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    component.state.detectedFrameworkVersion = '9.9.9';
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
    const FrameworkComponent = proxyquire('../../../../components/framework/serverless.js', {
      'cross-spawn': spawnStub,
    });

    const context = await getContext();
    const component = new FrameworkComponent('some-id', context, { path: 'path' });
    component.state.detectedFrameworkVersion = '9.9.9';
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
});
