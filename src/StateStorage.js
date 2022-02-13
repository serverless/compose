const utils = require('./utils/fs');
const path = require('path');
const fsp = require('fs').promises;

class StateStorage {
  constructor() {
    this.stateRoot = path.join(process.cwd(), '.serverless');
  }

  async readServiceState(defaultState) {
    await this.readState();

    if (this.state.service === undefined) {
      this.state.service = defaultState;
      await this.writeState();
    }

    return this.state.service;
  }

  async readComponentState(componentId, stage) {
    await this.readState();

    return this.state[stage]?.components?.[componentId]?.state ?? {};
  }

  async writeComponentState(componentId, stage, componentState) {
    await this.readState();

    this.state[stage] = this.state[stage] ?? {};
    this.state[stage].components = this.state[stage].components ?? {};
    this.state[stage].components[componentId] = this.state[stage].components[componentId] ?? {};
    this.state[stage].components[componentId].state = componentState;

    await this.writeState();
  }

  async readRootComponentsOutputs(stage) {
    await this.readState();

    if (!this.state[stage]?.components) {
      return {};
    }

    const outputs = {};
    for (const [id, data] of Object.entries(this.state[stage]?.components)) {
      outputs[id] = data.outputs ?? {};
    }
    return outputs;
  }

  async readComponentOutputs(componentId, stage) {
    await this.readState();

    return this.state[stage]?.components?.[componentId]?.outputs ?? {};
  }

  async writeComponentOutputs(componentId, stage, componentOutputs) {
    await this.readState();

    this.state[stage] = this.state.stage ?? {};
    this.state[stage].components = this.state[stage].components ?? {};
    this.state[stage].components[componentId] = this.state[stage].components[componentId] ?? {};
    this.state[stage].components[componentId].outputs = componentOutputs;

    await this.writeState();
  }

  async readState() {
    // Load the state only once
    // We will assume it doesn't change outside of our process
    // TODO add locking mechanism in the future
    if (this.state === undefined) {
      const stateFilePath = path.join(this.stateRoot, 'state.json');
      if (await utils.fileExists(stateFilePath)) {
        this.state = await utils.readFile(stateFilePath);
      } else {
        this.state = {};
      }
    }
    return this.state;
  }

  async writeState() {
    const stateFilePath = path.join(this.stateRoot, 'state.json');
    await utils.writeFile(stateFilePath, this.state);
  }
}

module.exports = StateStorage;
