'use strict';

const S3StateStorage = require('./S3StateStorage');
const getStateBucketName = require('./utils/get-state-bucket-name');
const getComposeS3StateBucketRegion = require('./utils/get-compose-s3-state-bucket-region');

/**
 * @param {Record<string, any>} stateConfiguration
 * @param {import('../Context')} context
 * @returns {Promise<S3StateStorage>}
 */
const getS3StateStorageFromConfig = async (stateConfiguration, context) => {
  const bucketName = await getStateBucketName(stateConfiguration, context);
  const stateKey = `${stateConfiguration.prefix ? `${stateConfiguration.prefix}/` : ''}${
    this.stage
  }/state.json`;

  // We want to resolve region from S3 only for externally provided S3 buckets to avoid extra SDK call
  const region = stateConfiguration.externalBucket
    ? await getComposeS3StateBucketRegion(bucketName)
    : 'us-east-1';
  return new S3StateStorage({ bucketName, stateKey, region });
};

module.exports = getS3StateStorageFromConfig;
