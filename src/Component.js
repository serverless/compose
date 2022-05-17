'use strict';

class Component {
  /**
   * @param {string} id
   * @param {import('./ComponentContext')} context
   * @param {Record<string, any>} inputs
   */
  constructor(id, context, inputs) {
    this.id = id;
    this.inputs = inputs;
    this.context = context;
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
}

module.exports = Component;
