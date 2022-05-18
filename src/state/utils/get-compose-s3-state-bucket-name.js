'use strict';

const AWS = require('@aws-sdk/client-cloudformation');
const { sleep } = require('../../utils');
const remoteStateCloudFormationTemplate = require('./remote-state-cloudformation-template.json');

const COMPOSE_REMOTE_STATE_STACK_NAME = 'serverless-compose-remote-state-stack';

const getCloudFormationClient = () => {
  // We are enforcing us-east-1 as the intention (that might change in the future if we find a good reason)
  // is to only create one such bucket across all regions in a single AWS Account
  // TODO: INJECT RESOLVED AWS CREDENTIALS
  return new AWS.CloudFormation({ region: 'us-east-1' });
};

// TODO: ADD LOGS
// TODO: REFACTORING
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
    context.logVerbose(`Deployment finished with this state: ${status}`);
    return status;
  }

  // TODO: REPLACE WITH PROPER ERROR
  throw new Error(`Encountered an error during deployment. Stack status: ${status}`);
};

// TODO: FINALIZE THE DEFAULT SETTINGS FOR REMOTE STATE BUCKET
const ensureRemoteStateBucketStackExists = async (context) => {
  const client = getCloudFormationClient();
  const templateBody = JSON.stringify(remoteStateCloudFormationTemplate);

  // TODO: REPLACE WITH PROGRESS
  context.output.log('Creating S3 bucket for remote state', ['serverless']);

  // TODO: HANDLE ERROR?
  await client.createStack({
    StackName: COMPOSE_REMOTE_STATE_STACK_NAME,
    TemplateBody: templateBody,
  });

  await monitorStackCreation(COMPOSE_REMOTE_STATE_STACK_NAME, context);
  context.output.log('S3 bucket for remote state created successfully', ['serverless']);
};

const getComposeS3StateBucketNameFromCF = async () => {
  const client = getCloudFormationClient();
  const logicalResourceId = 'ServerlessComposeRemoteStateBucket';
  const result = await client.describeStackResource({
    StackName: COMPOSE_REMOTE_STATE_STACK_NAME,
    LogicalResourceId: logicalResourceId,
  });
  return result.StackResourceDetail.PhysicalResourceId;
};

// TODO: INTRODUCE CONFIG INTO THAT
const getComposeS3StateBucketName = async (stateConfiguration, context) => {
  // 1. Check from config
  if (stateConfiguration && stateConfiguration.existingBucket) {
    return stateConfiguration.existingBucket;
  }

  // 2. Check from remote
  try {
    return await getComposeS3StateBucketNameFromCF(context);
  } catch (e) {
    if (!e.message.includes('does not exist')) {
      // TODO: THROW MORE SPECIFIC ERROR IF POSSIBLE
      throw e;
    }
    // If message incldues 'does not exist', we need to create the stack first
  }

  // 3. If stack does not exist, ensure it exists
  // TODO: ADD ERROR HANDLING
  await ensureRemoteStateBucketStackExists(context);

  // 4. Check from remote again
  return await getComposeS3StateBucketNameFromCF(context);
};

module.exports = getComposeS3StateBucketName;
