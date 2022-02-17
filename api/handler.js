const AWS = require('aws-sdk');

module.exports.hello = async (event) => {
  const sqs = new AWS.SQS({
    apiVersion: 'latest',
    region: process.env.AWS_REGION,
  });

  await sqs
    .sendMessage({
      QueueUrl: process.env.QUEUE_URL,
      // Any event data we want to send
      MessageBody: JSON.stringify({
        message: 'Hello',
        date: Date.now(),
      }),
    })
    .promise();

  console.log('A new message has been pushed into SQS');

  return {
    message: 'Hello world!',
  };
};
