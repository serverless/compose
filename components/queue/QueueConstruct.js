const { Stack, CfnOutput, Duration } = require('aws-cdk-lib');
const { Key } = require('aws-cdk-lib/aws-kms');
const { NodejsFunction } = require('aws-cdk-lib/aws-lambda-nodejs');
const { Queue, QueueEncryption } = require('aws-cdk-lib/aws-sqs');
const ServerlessError = require('../../src/serverless-error');
const { SqsEventSource } = require('aws-cdk-lib/aws-lambda-event-sources');

class QueueConstruct extends Stack {
  /**
   * @param scope
   * @param {string} id
   * @param {import('./Input').QueueInput} props
   */
  constructor(scope, id, props) {
    super(scope, id);

    const maxBatchingWindow = props.maxBatchingWindow ?? 0;
    // The default function timeout is 6 seconds in the Serverless Framework
    const functionTimeout = props.worker.timeout ?? 6;

    // This should be 6 times the lambda function's timeout + MaximumBatchingWindowInSeconds
    // See https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html
    const visibilityTimeout = functionTimeout * 6 + maxBatchingWindow;

    const maxRetries = props.maxRetries ?? 3;

    let delay = undefined;
    if (props.delay !== undefined) {
      if (props.delay < 0 || props.delay > 900) {
        throw new ServerlessError(
          `Invalid props in 'services.${id}': 'delay' must be between 0 and 900, '${props.delay}' given.`,
          'INVALID_COMPONENT_CONFIGURATION'
        );
      }

      delay = Duration.seconds(props.delay);
    }

    let encryption = undefined;
    if (!props.encryption || props.encryption.length === 0) {
      encryption = {};
    } else if (props.encryption === 'kmsManaged') {
      encryption = { encryption: QueueEncryption.KMS_MANAGED };
    } else if (props.encryption === 'kms') {
      if (!props.encryptionKey || props.encryptionKey.length === 0) {
        throw new ServerlessError(
          `Invalid props in 'services.${id}': 'encryptionKey' must be set if the 'encryption' is set to 'kms'`,
          'INVALID_COMPONENT_CONFIGURATION'
        );
      }
      encryption = {
        encryption: QueueEncryption.KMS,
        encryptionMasterKey: new Key(this, props.encryptionKey),
      };
    } else {
      throw new ServerlessError(
        `Invalid props in 'services.${id}': 'encryption' must be one of 'kms', 'kmsManaged', null, '${props.encryption}' given.`,
        'INVALID_COMPONENT_CONFIGURATION'
      );
    }

    const dlq = new Queue(this, 'Dlq', {
      queueName: props.fifo === true ? `${this.stackName}-dlq.fifo` : `${this.stackName}-dlq`,
      // 14 days is the maximum, we want to keep these messages for as long as possible
      retentionPeriod: Duration.days(14),
      fifo: props.fifo,
      ...encryption,
    });

    const queue = new Queue(this, 'Queue', {
      queueName: props.fifo === true ? `${this.stackName}.fifo` : `${this.stackName}`,
      visibilityTimeout: Duration.seconds(visibilityTimeout),
      deadLetterQueue: {
        maxReceiveCount: maxRetries,
        queue: dlq,
      },
      fifo: props.fifo,
      deliveryDelay: delay,
      contentBasedDeduplication: props.fifo,
      ...encryption,
    });

    const worker = new NodejsFunction(this, 'Worker', {
      functionName: `${this.stackName}-worker`,
      entry: props.worker.entry,
      handler: props.worker.handler,
      timeout: Duration.seconds(functionTimeout),
    });
    worker.addEventSource(
      new SqsEventSource(queue, {
        maxBatchingWindow: Duration.seconds(maxBatchingWindow),
        // The default batch size is 1
        batchSize: props.batchSize ?? 1,
        reportBatchItemFailures: true,
      })
    );

    new CfnOutput(this, 'queueArn', {
      description: `ARN of the "${id}" SQS queue.`,
      value: queue.queueArn,
    });
    new CfnOutput(this, 'queueUrl', {
      description: `URL of the "${id}" SQS queue.`,
      value: queue.queueUrl,
    });
    new CfnOutput(this, 'dlqUrl', {
      description: `URL of the "${id}" SQS dead letter queue.`,
      value: dlq.queueUrl,
    });
  }
}

module.exports = QueueConstruct;
