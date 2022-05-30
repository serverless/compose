'use strict';

const crypto = require('crypto');
const AWS = require('@aws-sdk/client-cloudformation');
const { sleep } = require('../../utils');
const remoteStateCloudFormationTemplate = require('./remote-state-cloudformation-template.json');
const ServerlessError = require('../../serverless-error');

const COMPOSE_REMOTE_STATE_STACK_NAME = 'serverless-compose-state';

// TODO: INJECT RESOLVED AWS CREDENTIALS
const getCloudFormationClient = () => {
  // We are enforcing us-east-1 as the intention (that might change in the future if we find a good reason)
  // is to only create one such bucket across all regions in a single AWS Account
  return new AWS.CloudFormation({ region: 'us-east-1' });
};

const monitorStackCreation = async (stackName, context) => {
  const client = getCloudFormationClient();
  const describeStacksResponse = await client.describeStacks({ StackName: stackName });
  const status = describeStacksResponse.Stacks[0].StackStatus;

  if (status === 'CREATE_IN_PROGRESS') {
    // TODO: REMOVE WHEN REPLACED WITH PROGRESS
    context.logVerbose('Stack deployment in progress');
    await sleep(2000);
    return await monitorStackCreation(stackName, context);
  }

  if (status === 'CREATE_COMPLETE') {
    context.logVerbose(`Deployment finished with state: ${status}`);
    return status;
  }

  throw new ServerlessError(
    `Encountered an error during S3 remote state stack deployment. Stack in status: ${status}`,
    'CANNOT_DEPLOY_S3_REMOTE_STATE_STACK'
  );
};

/**
 * @param {import('../../Context')} context
 */
const ensureRemoteStateBucketStackExists = async (context) => {
  const client = getCloudFormationClient();
  const templateBody = JSON.stringify(remoteStateCloudFormationTemplate);

  // TODO: REPLACE WITH PROGRESS
  context.output.log('Creating S3 bucket for remote state');

  const bucketName = `serverless-compose-state-${crypto.randomBytes(6).toString('hex')}`;
  await client.createStack({
    StackName: COMPOSE_REMOTE_STATE_STACK_NAME,
    TemplateBody: templateBody,
    Parameters: [
      {
        ParameterKey: 'BucketName',
        ParameterValue: bucketName,
      },
    ],
  });

  await monitorStackCreation(COMPOSE_REMOTE_STATE_STACK_NAME, context);
  context.output.log('S3 bucket for remote state created successfully');
  return bucketName;
};

const getStateBucketNameFromCF = async () => {
  const client = getCloudFormationClient();
  const logicalResourceId = 'ServerlessComposeRemoteStateBucket';
  const result = await client.describeStackResource({
    StackName: COMPOSE_REMOTE_STATE_STACK_NAME,
    LogicalResourceId: logicalResourceId,
  });
  if (!result.StackResourceDetail) {
    throw new Error(
      `CloudFormation returned an empty response when fetching the stack "${COMPOSE_REMOTE_STATE_STACK_NAME}"`
    );
  }
  if (!result.StackResourceDetail.PhysicalResourceId) {
    throw new Error('The S3 bucket does not exist');
  }
  return result.StackResourceDetail.PhysicalResourceId;
};

/**
 * @param {Record<string, any>} stateConfiguration
 * @param {import('../../Context')} context
 * @returns {Promise<string>}
 */
const getStateBucketName = async (stateConfiguration, context) => {
  // 1. Check from config
  if (stateConfiguration && stateConfiguration.existingBucket) {
    return stateConfiguration.existingBucket;
  }

  // 2. Check from remote
  try {
    return await getStateBucketNameFromCF();
  } catch (e) {
    // If message incldues 'does not exist', we need move forward and create the stack first
    if (!(e.Code === 'ValidationError' && e.message.includes('does not exist'))) {
      throw new ServerlessError(
        `Could not retrieve S3 state bucket: ${e.message}`,
        'CANNOT_RETRIEVE_REMOTE_STATE_S3_BUCKET'
      );
    }
    // PASS
  }

  // 3. If stack does not exist, ensure it exists
  try {
    return await ensureRemoteStateBucketStackExists(context);
  } catch (e) {
    if (e instanceof ServerlessError) {
      throw e;
    } else {
      throw new ServerlessError(
        `Could not create remote state S3 bucket: ${e.message}`,
        'CANNOT_CREATE_REMOTE_STATE_S3_BUCKET'
      );
    }
  }
};

module.exports = getStateBucketName;
