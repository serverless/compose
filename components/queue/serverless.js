'use strict';

const Component = require('../../src/Component');
const CdkDeploy = require('../cdk/Cdk');
const { App } = require('aws-cdk-lib');
const QueueConstruct = require('./QueueConstruct');
const chalk = require('chalk');
const { pollMessages, retryMessages } = require('./sqs');
const ServerlessError = require('../../src/serverless-error');
const { SQSClient, PurgeQueueCommand, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { sdkConfig } = require('../cdk/sdk-config');
const { sleep } = require('../../src/utils/sleep');

class Queue extends Component {
  commands = {
    'failed': {
      handler: this.listDlq.bind(this),
    },
    'failed:retry': {
      handler: this.retryDlq.bind(this),
    },
    'failed:purge': {
      handler: this.purgeDlq.bind(this),
    },
    'send': {
      handler: this.sendMessage.bind(this),
    },
  };

  /** @type {string|undefined} */
  region;

  /**
   * @param {string} id
   * @param {import('../../src/Context')} context
   * @param {import('./Input').QueueInput} inputs
   */
  constructor(id, context, inputs) {
    super(id, context, inputs);

    this.stackName = `${this.appName}-${this.id}-${this.stage}`;
    // TODO validate input
    this.region = this.inputs.region;
  }

  async deploy() {
    this.startProgress('deploying');

    const app = new App();
    // @ts-ignore
    new QueueConstruct(app, this.stackName, this.inputs);

    const cdk = new CdkDeploy(this.logVerbose.bind(this), this.state, this.stackName, this.region);
    const hasChanges = await cdk.deploy(app);

    if (hasChanges) {
      // Save updated state
      await this.save();
      await this.updateOutputs(await cdk.getStackOutputs());
      this.successProgress('deployed');
    } else {
      this.successProgress('no changes');
    }
  }

  async remove() {
    this.startProgress('removing');

    // TODO empty bucket

    const cdk = new CdkDeploy(this.logVerbose.bind(this), this.state, this.stackName, this.region);
    await cdk.remove();

    this.state = {};
    await this.save();
    await this.updateOutputs({});

    this.successProgress('removed');
  }

  async listDlq() {
    this.startProgress('polling failed messages');
    const messages = await pollMessages({
      queueUrl: this.outputs.dlqUrl,
      progressCallback: (numberOfMessagesFound) => {
        this.updateProgress(`polling failed messages (${numberOfMessagesFound} found)`);
      },
    });
    if (messages.length === 0) {
      this.successProgress('no failed messages found');
      return;
    }
    this.successProgress(`${messages.length} failed messages found`);
    for (const message of messages) {
      this.writeText(chalk.gray(`Message #${message.MessageId ?? '?'}`));
      this.writeText(this.formatMessageBody(message.Body ?? ''));
      this.writeText('');
    }
    const retryCommand = chalk.bold(`serverless-console ${this.id}:failed:retry`);
    const purgeCommand = chalk.bold(`serverless-console ${this.id}:failed:purge`);
    this.writeText(
      `Run ${retryCommand} to retry all messages, or ${purgeCommand} to delete those messages forever.`
    );
  }

  async purgeDlq() {
    this.startProgress('purging failed messages');
    const sqsClient = new SQSClient(await sdkConfig());
    await sqsClient.send(
      new PurgeQueueCommand({
        QueueUrl: this.outputs.dlqUrl,
      })
    );
    /**
     * Sometimes messages are still returned after the purge is issued.
     * For a less confusing experience, we wait 500ms so that if the user re-runs `sls queue:failed` there
     * are fewer chances that deleted messages show up again.
     */
    await sleep(500);
    this.successProgress('failed messages purged');
  }

  async retryDlq() {
    this.startProgress('retrying failed messages');
    let shouldContinue = true;
    let totalMessagesToRetry = 0;
    let totalMessagesRetried = 0;
    do {
      const messages = await pollMessages({
        queueUrl: this.outputs.dlqUrl,
        /**
         * Since we intend on deleting the messages, we'll reserve them for 10 seconds
         * That avoids having those message reappear in the `do` loop, because SQS sometimes
         * takes a while to actually delete messages.
         */
        visibilityTimeout: 10,
      });
      totalMessagesToRetry += messages.length;
      this.updateProgress(
        `retrying failed messages (${totalMessagesRetried}/${totalMessagesToRetry})`
      );

      const result = await retryMessages(this.outputs.queueUrl, this.outputs.dlqUrl, messages);
      totalMessagesRetried += result.numberOfMessagesRetried;
      this.updateProgress(
        `retrying failed messages (${totalMessagesRetried}/${totalMessagesToRetry})`
      );

      // Stop if we have any failure (that simplifies the flow for now)
      if (
        result.numberOfMessagesRetriedButNotDeleted > 0 ||
        result.numberOfMessagesNotRetried > 0
      ) {
        let errorMessage =
          'There were some errors while retrying messages. Not all messages have been retried, run the command again to continue.\n';
        if (totalMessagesRetried > 0) {
          errorMessage += `${totalMessagesRetried} failed messages have been successfully moved to the main queue to be retried`;
        }
        if (result.numberOfMessagesNotRetried > 0) {
          errorMessage += `${result.numberOfMessagesNotRetried} failed messages could not be retried (for some unknown reason SQS refused to move them). These messages are still in the dead letter queue. Maybe try again?`;
        }
        if (result.numberOfMessagesRetriedButNotDeleted > 0) {
          errorMessage += `${result.numberOfMessagesRetriedButNotDeleted} failed messages were moved to the main queue, but were not successfully deleted from the dead letter queue. That means that these messages will be retried in the main queue, but they will also still be present in the dead letter queue.`;
        }
        throw new ServerlessError(
          `${totalMessagesRetried} failed messages have been successfully moved to the main queue to be retried`
        );
      }

      shouldContinue = result.numberOfMessagesRetried > 0;
    } while (shouldContinue);

    if (totalMessagesToRetry === 0) {
      this.successProgress('no failed messages found');
      return;
    }

    this.successProgress(
      `${totalMessagesRetried} failed message(s) moved to the main queue to be retried`
    );
  }

  async sendMessage(options) {
    if (typeof options.body !== 'string') {
      throw new ServerlessError(`You must provide a SQS message body via the '--body' option`);
    }
    if (this.inputs.fifo === true && typeof options['group-id'] !== 'string') {
      throw new ServerlessError(
        `The '${this.id}' queue is a FIFO queue. You must provide a SQS message group ID via the '--group-id' option`
      );
    }

    this.startProgress('sending message');

    const sqsClient = new SQSClient(await sdkConfig());
    const params = {
      QueueUrl: this.outputs.queueUrl,
      MessageBody: options.body,
    };
    if (this.inputs.fifo === true) {
      params.MessageGroupId = options['group-id'];
    }
    await sqsClient.send(new SendMessageCommand(params));

    this.successProgress('message sent');
  }

  /**
   * @param {string} body
   * @return {string}
   */
  formatMessageBody(body) {
    try {
      // If it's valid JSON, we'll format it nicely
      const data = JSON.parse(body);
      return JSON.stringify(data, null, 2);
    } catch (e) {
      // If it's not valid JSON, we'll print the body as-is
      return body;
    }
  }
}

module.exports = Queue;
