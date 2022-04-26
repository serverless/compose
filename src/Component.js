'use strict';

const ServerlessError = require('./serverless-error');

class Component {
  /**
   * @param {string} id
   * @param {import('./Context')} context
   * @param {Record<string, any>} inputs
   */
  constructor(id, context, inputs) {
    this.id = id || this.constructor.name;
    this.stage = context.stage;
    this.inputs = inputs;
    /** @private Let's try to keep the context private so that we limit the API surface for components */
    this.context = context;
    /** @type {Record<string, any>} */
    this.state = {};

    if (typeof this.outputs === 'function') {
      throw new ServerlessError(
        `Cannot declare an "outputs" function in component "${this.id}"`,
        'INVALID_COMPONENT_OUTPUTS'
      );
    }
  }

  // populating state is an async operation in most contexts
  // and we can't run async operations in the constructor
  // so we can't auto populate state on instance construction
  async init() {
    this.state = await this.context.stateStorage.readComponentState(this.id);
    this.outputs = await this.context.stateStorage.readComponentOutputs(this.id);
  }

  async deploy() {
    // To be implemented by components
  }

  async remove() {
    // To be implemented by components
  }

  async logs() {
    // To be implemented by components
  }

  async info() {
    // To be implemented by components
  }

  async refreshOutputs() {
    // To be implemented by components
  }

  async save() {
    await this.context.stateStorage.writeComponentState(this.id, this.state);
  }

  /**
   * @param {Record<string, any>} outputs
   */
  async updateOutputs(outputs) {
    this.outputs = outputs;
    await this.context.stateStorage.writeComponentOutputs(this.id, this.outputs);
  }

  /**
   * @param {string} message
   * @param {string[]} [namespace]
   */
  writeText(message, namespace = []) {
    this.context.output.writeText(message, [this.id, ...namespace]);
  }

  /**
   * @param {string} message
   * @param {string[]} [namespace]
   */
  logVerbose(message, namespace = []) {
    this.context.output.verbose(message, [this.id, ...namespace]);
  }

  /**
   * @param {string|Error} error
   * @param {string[]} [namespace]
   */
  logError(error, namespace = []) {
    this.context.output.error(error, [this.id, ...namespace]);
  }

  startProgress(text) {
    this.context.progresses.start(this.id, text);
  }

  updateProgress(text) {
    this.context.progresses.update(this.id, text);
  }

  successProgress(text) {
    this.context.progresses.success(this.id, text);
  }
}

module.exports = Component;
