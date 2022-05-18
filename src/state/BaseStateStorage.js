'use strict';

class BaseStateStorage {
  async readServiceState(defaultState) {
    await this.readState();

    if (this.state.service === undefined) {
      this.state.service = defaultState;
      await this.writeState();
    }

    return this.state.service;
  }

  async readComponentState(componentId) {
    await this.readState();

    return (
      (this.state.components &&
        this.state.components[componentId] &&
        this.state.components[componentId].state) ||
      {}
    );
  }

  async writeComponentState(componentId, componentState) {
    await this.readState();

    this.state.components = this.state.components || {};
    this.state.components[componentId] = this.state.components[componentId] || {};
    this.state.components[componentId].state = componentState;

    await this.writeState();
  }

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

  async readComponentOutputs(componentId) {
    await this.readState();

    return (
      (this.state.components &&
        this.state.components[componentId] &&
        this.state.components[componentId].outputs) ||
      {}
    );
  }

  async writeComponentOutputs(componentId, componentOutputs) {
    await this.readState();
    this.state.components = this.state.components || {};
    this.state.components[componentId] = this.state.components[componentId] || {};
    this.state.components[componentId].outputs = componentOutputs;

    await this.writeState();
  }

  async readState() {
    // To be implemented by specialized StateStorage class
    throw new Error('Not implemented');
  }

  async writeState() {
    // To be implemented by specialized StateStorage class
    throw new Error('Not implemented');
  }

  async removeState() {
    // To be implemented by specialized StateStorage class
    throw new Error('Not implemented');
  }
}

module.exports = BaseStateStorage;
