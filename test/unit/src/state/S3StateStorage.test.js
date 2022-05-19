'use strict';

const chai = require('chai');
const sinon = require('sinon');
const stream = require('stream');

const S3StateStorage = require('../../../../src/state/S3StateStorage');

chai.use(require('sinon-chai'));
chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('test/unit/src/state/S3StateStorage.test.js', () => {
  const bucketName = 'dummy-bucket';
  const stateKey = 'dummy-key';

  it('properly reads state from S3 bucket', async () => {
    const s3StateStorage = new S3StateStorage({ bucketName, stateKey });
    const mockedS3Client = {
      getObject: sinon.stub().resolves({
        Body: stream.Readable.from([
          Buffer.from(JSON.stringify({ components: { resources: { state: {} } } })),
        ]),
      }),
    };
    s3StateStorage.s3Client = mockedS3Client;
    const result = await s3StateStorage.readState();
    expect(result).to.deep.equal({ components: { resources: { state: {} } } });
    expect(mockedS3Client.getObject).to.have.been.calledOnceWithExactly({
      Bucket: bucketName,
      Key: stateKey,
    });
  });

  it('gracefully handles situation where state file in S3 is not present', async () => {
    const s3StateStorage = new S3StateStorage({ bucketName, stateKey });
    const getError = new Error();
    getError.Code = 'NoSuchKey';
    const mockedS3Client = {
      getObject: sinon.stub().rejects(getError),
    };
    s3StateStorage.s3Client = mockedS3Client;
    const result = await s3StateStorage.readState();
    expect(result).to.deep.equal({});
    expect(mockedS3Client.getObject).to.have.been.calledOnceWithExactly({
      Bucket: bucketName,
      Key: stateKey,
    });
  });

  it('rejects if error other than NoSuchKey has been reported when reading state from S3', async () => {
    const s3StateStorage = new S3StateStorage({ bucketName, stateKey });
    const mockedS3Client = {
      getObject: sinon.stub().rejects(new Error()),
    };
    s3StateStorage.s3Client = mockedS3Client;
    await expect(s3StateStorage.readState()).to.have.been.eventually.rejected.and.have.property(
      'code',
      'CANNOT_READ_S3_REMOTE_STATE'
    );
  });

  it('properly updates state in S3 bucket', async () => {
    const s3StateStorage = new S3StateStorage({ bucketName, stateKey });
    const mockedS3Client = {
      putObject: sinon.stub().resolves(),
    };
    s3StateStorage.s3Client = mockedS3Client;
    s3StateStorage.state = { dummy: true };
    await s3StateStorage.writeState();
    expect(mockedS3Client.putObject).to.have.been.calledOnceWithExactly({
      Bucket: bucketName,
      Key: stateKey,
      Body: JSON.stringify({ dummy: true }),
    });
  });

  it('properly removes state from S3 bucket', async () => {
    const s3StateStorage = new S3StateStorage({ bucketName, stateKey });
    const mockedS3Client = {
      deleteObject: sinon.stub().resolves(),
    };
    s3StateStorage.s3Client = mockedS3Client;
    await s3StateStorage.removeState();
    expect(mockedS3Client.deleteObject).to.have.been.calledOnceWithExactly({
      Bucket: bucketName,
      Key: stateKey,
    });
  });
});
