const { sleep } = require('../../src/utils/sleep');
const { sdkConfig } = require('../cdk/sdk-config');
const { chunk } = require('lodash');
const {
  SQSClient,
  ReceiveMessageCommand,
  SendMessageBatchCommand,
  DeleteMessageBatchCommand,
} = require('@aws-sdk/client-sqs');
const ServerlessError = require('../../src/serverless-error');

/** @typedef {import('@aws-sdk/client-sqs').Message} Message */

/**
 * @param {{
 *   queueUrl: string,
 *   progressCallback?: (numberOfMessagesFound: number) => void,
 *   visibilityTimeout?: number,
 * }} param
 * @return {Promise<Message[]>}
 */
async function pollMessages({ queueUrl, progressCallback, visibilityTimeout }) {
  const sqsClient = new SQSClient(await sdkConfig());

  /** @type {Message[]} */
  const messages = [];
  const promises = [];
  /**
   * Poll in parallel to hit multiple SQS servers at once
   * See https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-short-and-long-polling.html
   * and https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_ReceiveMessage.html
   * (a single request might not return all messages)
   */
  for (let i = 0; i < 3; i++) {
    promises.push(
      pollMoreMessages(sqsClient, queueUrl, messages, visibilityTimeout).then(() => {
        if (progressCallback && messages.length > 0) {
          progressCallback(messages.length);
        }
      })
    );
    await sleep(200);
  }
  await Promise.all(promises);

  return messages;
}

/**
 * @param {SQSClient} sqsClient
 * @param {string} queueUrl
 * @param {Message[]} messages
 * @param {number} visibilityTimeout?
 * @return {Promise<void>}
 */
async function pollMoreMessages(sqsClient, queueUrl, messages, visibilityTimeout) {
  const messagesResponse = await sqsClient.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      // 10 is the maximum
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 3,
      // By default only hide messages for 1 second to avoid disrupting the queue too much
      VisibilityTimeout: visibilityTimeout ?? 1,
    })
  );
  for (const newMessage of messagesResponse.Messages ?? []) {
    const alreadyInTheList = messages.some((message) => {
      return message.MessageId === newMessage.MessageId;
    });
    if (!alreadyInTheList) {
      messages.push(newMessage);
    }
  }
}

/**
 * @param {string} queueUrl
 * @param {string} dlqUrl
 * @param {Message[]} messages
 * @return {Promise<{
 *   numberOfMessagesNotRetried: number,
 *   numberOfMessagesRetried: number,
 *   numberOfMessagesRetriedButNotDeleted: number
 * }>}
 */
async function retryMessages(queueUrl, dlqUrl, messages) {
  const sqsClient = new SQSClient(await sdkConfig());

  if (messages.length === 0) {
    return {
      numberOfMessagesRetried: 0,
      numberOfMessagesNotRetried: 0,
      numberOfMessagesRetriedButNotDeleted: 0,
    };
  }

  const sendBatches = chunk(messages, 10);
  const sendResults = await Promise.all(
    sendBatches.map((batch) =>
      sqsClient.send(
        new SendMessageBatchCommand({
          QueueUrl: queueUrl,
          Entries: batch.map((message) => {
            if (message.MessageId === undefined) {
              throw new Error(`Found a message with no ID`);
            }

            return {
              Id: message.MessageId,
              MessageAttributes: message.MessageAttributes,
              MessageBody: message.Body,
            };
          }),
        })
      )
    )
  );

  const messagesToDelete = messages.filter((message) => {
    const isMessageInFailedList = sendResults.some(
      ({ Failed }) =>
        Failed && Failed.some((failedMessage) => message.MessageId === failedMessage.Id)
    );
    return !isMessageInFailedList;
  });

  /** @type {Message[][]} */
  const deleteBatches = chunk(messagesToDelete, 10);
  const deletionResults = await Promise.all(
    deleteBatches.map((batch) =>
      sqsClient.send(
        new DeleteMessageBatchCommand({
          QueueUrl: dlqUrl,
          Entries: batch.map((message) => {
            return {
              Id: message.MessageId,
              ReceiptHandle: message.ReceiptHandle,
            };
          }),
        })
      )
    )
  );

  const numberOfMessagesRetried = deletionResults.reduce(
    (total, { Successful }) => total + Successful?.length,
    0
  );
  const numberOfMessagesNotRetried = sendResults.reduce(
    (total, { Failed }) => total + Failed?.length,
    0
  );
  const numberOfMessagesRetriedButNotDeleted = deletionResults.reduce(
    (total, { Failed }) => total + Failed?.length,
    0
  );

  if (numberOfMessagesRetriedButNotDeleted > 0) {
    throw new ServerlessError(
      `${numberOfMessagesRetriedButNotDeleted} failed messages were not successfully deleted from the dead letter queue. These messages will be retried in the main queue, but they will also still be present in the dead letter queue.`
    );
  }

  return {
    numberOfMessagesRetried,
    numberOfMessagesNotRetried,
    numberOfMessagesRetriedButNotDeleted,
  };
}

module.exports = {
  pollMessages,
  retryMessages,
};
