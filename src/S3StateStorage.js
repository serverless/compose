'use strict';

const { S3 } = require('@aws-sdk/client-s3');
const PromiseQueue = require('promise-queue');

PromiseQueue.configure(Promise);

// TODO: SEPARATE IT AS AN UTIL
const streamToString = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });

// TODO: TESTS
// TODO: REQUIRE USERS TO PROVIDE REGION OF S3 bucket if they configure their own??
class S3StateStorage {
  constructor(config) {
    // TODO: HANDLE BUCKETS FROM DIFFERENT REGIONS TOO
    // TODO: We need to resolve bucket location if its provided by user directly
    this.region = 'us-east-1';

    this.bucketName = config.bucketName;

    this.stateKey = config.stateKey;

    // TODO: ENSURE TO OVERRIDE CREDENTIALS
    this.s3Client = new S3({ region: this.region });

    this.writeRequestQueue = new PromiseQueue(1, Infinity);
  }

  // TODO: MOVE TO BASE CLASS
  async readServiceState(defaultState) {
    await this.readState();

    if (this.state.service === undefined) {
      this.state.service = defaultState;
      await this.writeState();
    }

    return this.state.service;
  }

  // TODO: MOVE TO BASE CLASS
  async readComponentState(componentId) {
    await this.readState();

    return (
      (this.state.components &&
        this.state.components[componentId] &&
        this.state.components[componentId].state) ||
      {}
    );
  }

  // TODO: MOVE TO BASE CLASS
  async writeComponentState(componentId, componentState) {
    await this.readState();

    this.state.components = this.state.components || {};
    this.state.components[componentId] = this.state.components[componentId] || {};
    this.state.components[componentId].state = componentState;

    await this.writeState();
  }

  // TODO: MOVE TO BASE CLASS
  async readComponentsOutputs() {
    await this.readState();

    if (!this.state || !this.state.components) {
      return {};
    }

    const outputs = {};
    for (const [id, data] of Object.entries(this.state.components)) {
      outputs[id] = data.outputs || {};
    }
    return outputs;
  }

  // TODO: MOVE TO BASE CLASS
  async readComponentOutputs(componentId) {
    await this.readState();

    return (
      (this.state.components &&
        this.state.components[componentId] &&
        this.state.components[componentId].outputs) ||
      {}
    );
  }

  // TODO: MOVE TO BASE CLASS
  async writeComponentOutputs(componentId, componentOutputs) {
    await this.readState();
    this.state.components = this.state.components || {};
    this.state.components[componentId] = this.state.components[componentId] || {};
    this.state.components[componentId].outputs = componentOutputs;

    await this.writeState();
  }

  // TODO: MAKE IT ABSTRACT IN BASE CLASS
  async readState() {
    // State is loaded only once under the assumption
    // That it is not changed by any other process in the meantime
    // In the future, if needed, we will introduce locking capabilities

    if (this.state === undefined) {
      try {
        const stateObjectFromS3 = await this.s3Client.getObject({
          Bucket: this.bucketName,
          Key: this.stateKey,
        });
        const readState = await streamToString(stateObjectFromS3.Body);
        // TODO: HANDLE POTENTIAL ERROR HERE TOO
        this.state = JSON.parse(readState);
      } catch (e) {
        // TODO: INTRODUCE BETTER ERROR HANDLING
        this.state = {};
      }
    }
    return this.state;
  }

  async writeState() {
    await this.writeRequestQueue.add(async () => {
      await this.s3Client.putObject({
        Bucket: this.bucketName,
        Key: this.stateKey,
        Body: JSON.stringify(this.state),
      });
    });
  }

  async removeState() {
    await this.s3Client.deleteObject({
      Bucket: this.bucketName,
      Key: this.stateKey,
    });
  }
}

module.exports = S3StateStorage;
