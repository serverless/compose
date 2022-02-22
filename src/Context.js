'use strict';

const path = require('path');
const prettyoutput = require('prettyoutput');
const utils = require('./utils');
const packageJson = require('../package.json');
const StateStorage = require('./StateStorage');
const Logger = require('./cli/Logger');
const readline = require('readline');
const Progresses = require('./cli/Progresses');
const colors = require('./cli/colors');
const { safeWrite } = require('./cli/output');

class Context {
  /** @type {StateStorage} */
  stateStorage;
  /** @type {Progresses} */
  progresses;
  /** @type {Logger} */
  logger;

  constructor(config) {
    this.version = packageJson.version;
    this.root = path.resolve(config.root) || process.cwd();
    this.logger = new Logger(config.verbose || false);
    this.stateStorage = new StateStorage(config.stage);
    this.stage = config.stage;
    this.id = undefined;

    this.progresses = new Progresses();
    if (!config.verbose) {
      this.progresses.setFooterText(colors.darkGray('Press [?] to enable verbose logs'));
    }
  }

  async init() {
    this.startInteractiveInput();

    const serviceState = await this.stateStorage.readServiceState({ id: utils.randomId() });
    this.id = serviceState.id;
  }

  renderOutputs(outputs) {
    if (typeof outputs !== 'object' || Object.keys(outputs).length === 0) {
      return;
    }
    safeWrite(
      `\n${prettyoutput(outputs, {
        colors: {
          keys: 'gray',
          dash: 'gray',
          number: 'white',
          true: 'white',
          false: 'white',
        },
      })}`,
      process.stdout
    );
  }

  logVerbose(message) {
    this.logger.verbose(message, ['serverless']);
  }

  startInteractiveInput() {
    // Start listening to specific keypresses
    readline.emitKeypressEvents(process.stdin);
    process.stdin.on('keypress', (character, key) => {
      if (character === '?') {
        this.logger.enableVerbose();
        this.progresses.setFooterText();
      }
      if (key && key.ctrl && key.name === 'c') {
        // Restore the Ctrl+C behavior by sending SIGINT to ourselves
        // See https://nodejs.org/api/tty.html#readstreamsetrawmodemode
        process.kill(process.pid, 'SIGINT');
      }
    });
    // This is the line that enables the interactive mode
    // If later we need user input (e.g. prompts), we need to disable this
    // See https://nodejs.org/api/tty.html#readstreamsetrawmodemode
    process.stdin.setRawMode(true);
  }

  shutdown() {
    this.progresses.setFooterText('');
    this.progresses.stopAll();
  }
}

module.exports = Context;
