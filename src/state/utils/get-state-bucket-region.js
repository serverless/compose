'use strict';

const { S3 } = require('@aws-sdk/client-s3');
const ServerlessError = require('../../serverless-error');

const getStateBucketRegion = async (bucketName) => {
  // TODO: INJECT RESOLVED AWS CREDENTIALS
  const client = new S3();

  let result;
  try {
    result = await client.getBucketLocation({ Bucket: bucketName });
  } catch (e) {
    if (e.Code === 'NoSuchBucket') {
      throw new ServerlessError(
        `Provided bucket: "${bucketName}" could not be found.`,
        'CANNOT_FIND_PROVIDED_REMOTE_STATE_BUCKET'
      );
    }

    if (e.Code === 'AccessDenied') {
      throw new ServerlessError(
        `Access to provided bucket: "${bucketName}" has been denied.`,
        'CANNOT_ACCESS_PROVIDED_REMOTE_STATE_BUCKET'
      );
    }

    throw new ServerlessError(
      `Provided bucket: "${bucketName}" could not be accessed: ${e.message}.`,
      'GENERIC_CANNOT_ACCESS_PROVIDED_REMOTE_STATE_BUCKET'
    );
  }

  // Buckets in `us-east-1` have `LocationConstraint` empty
  return result.LocationConstraint || 'us-east-1';
};

module.exports = getStateBucketRegion;
