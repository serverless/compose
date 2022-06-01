'use strict';

const { getCredentialProvider } = require('@serverless-components/utils-aws');

const S3StateStorage = require('./S3StateStorage');
const getStateBucketName = require('./utils/get-state-bucket-name');
const getStateBucketRegion = require('./utils/get-state-bucket-region');

/**
 * @param {Record<string, any>} stateConfiguration
 * @param {import('../Context')} context
 * @returns {Promise<S3StateStorage>}
 */
const getS3StateStorageFromConfig = async (stateConfiguration, context) => {
  const bucketName = await getStateBucketName(stateConfiguration, context);
  const stateKey = `${stateConfiguration.prefix ? `${stateConfiguration.prefix}/` : ''}${
    context.stage
  }/state.json`;

  // We want to resolve region from S3 only for externally provided S3 buckets to avoid extra SDK call
  const region = stateConfiguration.externalBucket
    ? await getStateBucketRegion(bucketName)
    : 'us-east-1';

  const credentialProvider = getCredentialProvider({ profile: stateConfiguration.profile, region });

  return new S3StateStorage({ bucketName, stateKey, region, credentials: credentialProvider });
};

module.exports = getS3StateStorageFromConfig;
