'use strict';

const BaseStateStorage = require('./BaseStateStorage');
const utils = require('../utils/fs');
const path = require('path');
const fsp = require('fs').promises;

class LocalStateStorage extends BaseStateStorage {
  constructor(stage) {
    super();
    this.stateRoot = path.join(process.cwd(), '.serverless');
    this.stage = stage;
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

module.exports = LocalStateStorage;
