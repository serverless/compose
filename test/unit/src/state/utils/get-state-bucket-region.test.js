'use strict';

const chai = require('chai');
const { mockClient } = require('aws-sdk-client-mock');
const { S3Client, GetBucketLocationCommand } = require('@aws-sdk/client-s3');

const getStateBucketRegion = require('../../../../../src/state/utils/get-state-bucket-region');

chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('test/unit/src/state/utils/get-state-bucket-region.test.js', () => {
  let s3Mock;
  before(() => {
    s3Mock = mockClient(S3Client);
  });

  beforeEach(() => {
    s3Mock.reset();
  });

  const bucketName = 'test-bucket';

  it('correctly resolves region for `us-east-1` bucket', async () => {
    s3Mock.on(GetBucketLocationCommand).resolves({ LocationConstraint: undefined });
    expect(await getStateBucketRegion(bucketName)).to.equal('us-east-1');
  });

  it('correctly resolves region for non `us-east-1` bucket', async () => {
    s3Mock.on(GetBucketLocationCommand).resolves({ LocationConstraint: 'eu-central-1' });
    expect(await getStateBucketRegion(bucketName)).to.equal('eu-central-1');
  });

  it('rejects when bucket cannot be found', async () => {
    const bucketDoesNotExistError = new Error('No such bucket');
    bucketDoesNotExistError.Code = 'NoSuchBucket';

    s3Mock.on(GetBucketLocationCommand).rejects(bucketDoesNotExistError);
    await expect(getStateBucketRegion(bucketName)).to.be.eventually.rejected.and.have.property(
      'code',
      'CANNOT_FIND_PROVIDED_REMOTE_STATE_BUCKET'
    );
  });

  it('rejects when access to bucket is denied', async () => {
    const bucketCannotBeAccessedError = new Error('No such bucket');
    bucketCannotBeAccessedError.Code = 'AccessDenied';

    s3Mock.on(GetBucketLocationCommand).rejects(bucketCannotBeAccessedError);
    await expect(getStateBucketRegion(bucketName)).to.be.eventually.rejected.and.have.property(
      'code',
      'CANNOT_ACCESS_PROVIDED_REMOTE_STATE_BUCKET'
    );
  });

  it('rejects on generic error', async () => {
    s3Mock.on(GetBucketLocationCommand).rejects(new Error('failure'));
    await expect(getStateBucketRegion(bucketName)).to.be.eventually.rejected.and.have.property(
      'code',
      'GENERIC_CANNOT_ACCESS_PROVIDED_REMOTE_STATE_BUCKET'
    );
  });
});
