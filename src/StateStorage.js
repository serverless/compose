'use strict';

const utils = require('./utils/fs');
const path = require('path');
const fsp = require('fs').promises;

class StateStorage {
  constructor(stage) {
    this.stateRoot = path.join(process.cwd(), '.serverless');
    this.stage = stage;
  }

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

    return this.state[this.stage]?.components?.[componentId]?.state ?? {};
  }

  async writeComponentState(componentId, componentState) {
    await this.readState();

    this.state.components = this.state.components ?? {};
    this.state.components[componentId] = this.state.components[componentId] ?? {};
    this.state.components[componentId].state = componentState;

    await this.writeState();
  }

  async readComponentsOutputs() {
    await this.readState();

    if (!this.state?.components) {
      return {};
    }

    const outputs = {};
    for (const [id, data] of Object.entries(this.state.components)) {
      outputs[id] = data.outputs ?? {};
    }
    return outputs;
  }

  async readComponentOutputs(componentId) {
    await this.readState();

    return this.state?.components?.[componentId]?.outputs ?? {};
  }

  async writeComponentOutputs(componentId, componentOutputs) {
    await this.readState();
    this.state.components = this.state.components ?? {};
    this.state.components[componentId] = this.state.components[componentId] ?? {};
    this.state.components[componentId].outputs = componentOutputs;

    await this.writeState();
  }

  async readState() {
    // Load the state only once
    // We will assume it doesn't change outside of our process
    // TODO add locking mechanism in the future
    if (this.state === undefined) {
      const stateFilePath = path.join(this.stateRoot, `state.${this.stage}.json`);
      if (await utils.fileExists(stateFilePath)) {
        this.state = await utils.readFile(stateFilePath);
      } else {
        this.state = {};
      }
    }
    return this.state;
  }

  async writeState() {
    const stateFilePath = path.join(this.stateRoot, `state.${this.stage}.json`);
    await utils.writeFile(stateFilePath, this.state);
  }

  async removeState() {
    const stateFilePath = path.join(this.stateRoot, `state.${this.stage}.json`);
    await fsp.unlink(stateFilePath);
  }
}

module.exports = StateStorage;
