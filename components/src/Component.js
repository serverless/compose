'use strict';

class Component {
  /**
   * @param {string} id
   * @param {import('./index').ComponentContext} context
   * @param {Record<string, any>} inputs
   */
  constructor(id, context, inputs) {
    this.id = id;
    this.context = context;
    this.inputs = inputs;
  }
}

module.exports = Component;
