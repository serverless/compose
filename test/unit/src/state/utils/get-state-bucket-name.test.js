'use strict';

const chai = require('chai');
const { mockClient } = require('aws-sdk-client-mock');
const {
  CloudFormationClient,
  DescribeStackResourceCommand,
  CreateStackCommand,
  DescribeStacksCommand,
} = require('@aws-sdk/client-cloudformation');

const getStateBucketName = require('../../../../../src/state/utils/get-state-bucket-name');
const Context = require('../../../../../src/Context');

chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('test/unit/src/state/utils/get-state-bucket-name.test.js', () => {
  let cfMock;
  let context;
  before(() => {
    cfMock = mockClient(CloudFormationClient);
    const contextConfig = {
      root: process.cwd(),
      stage: 'dev',
      disableIO: true,
    };
    context = new Context(contextConfig);
  });

  beforeEach(() => {
    cfMock.reset();
  });

  it('resolves external bucket name from config', async () => {
    const configuration = {
      backend: 's3',
      existingBucket: 'existing',
    };
    expect(await getStateBucketName(configuration, context)).to.equal('existing');
  });

  it('resolves already existing bucket name provisioned by compose', async () => {
    const configuration = { backend: 's3' };
    cfMock
      .on(DescribeStackResourceCommand)
      .resolves({ StackResourceDetail: { PhysicalResourceId: 'fromcf' } });

    expect(await getStateBucketName(configuration, context)).to.equal('fromcf');
  });

  it('resolves bucket that had to be created', async () => {
    const configuration = { backend: 's3' };
    const stackDoesNotExistError = new Error('Stack "test" does not exist');
    stackDoesNotExistError.Code = 'ValidationError';
    cfMock
      .on(DescribeStackResourceCommand)
      .rejectsOnce(stackDoesNotExistError)
      .on(CreateStackCommand)
      .resolves()
      .on(DescribeStacksCommand)
      .resolves({ Stacks: [{ StackStatus: 'CREATE_COMPLETE' }] });

    expect(
      (await getStateBucketName(configuration, context)).startsWith('serverless-compose-state-')
    ).to.be.true;
  });

  it('handles unexpected error when resolving bucket from s3', async () => {
    const configuration = { backend: 's3' };
    const unknownError = new Error('unknown error');
    cfMock.on(DescribeStackResourceCommand).rejects(unknownError);

    await expect(
      getStateBucketName(configuration, context)
    ).to.be.eventually.rejected.and.have.property('code', 'CANNOT_RETRIEVE_REMOTE_STATE_S3_BUCKET');
  });

  it('handles unexpected error when creating bucket from s3', async () => {
    const configuration = { backend: 's3' };
    const stackDoesNotExistError = new Error('Stack "test" does not exist');
    stackDoesNotExistError.Code = 'ValidationError';
    cfMock
      .on(DescribeStackResourceCommand)
      .rejects(stackDoesNotExistError)
      .on(CreateStackCommand)
      .resolves()
      .on(DescribeStacksCommand)
      .resolves({ Stacks: [{ StackStatus: 'CREATE_FAILED' }] });

    await expect(
      getStateBucketName(configuration, context)
    ).to.be.eventually.rejected.and.have.property('code', 'CANNOT_DEPLOY_S3_REMOTE_STATE_STACK');
  });
});
