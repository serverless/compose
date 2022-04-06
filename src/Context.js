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

class Context {
  /** @type {StateStorage} */
  stateStorage;
  /** @type {Progresses} */
  progresses;
  /** @type {Logger} */
  logger;
  /** @type {Record<string, 'success'|'failure'|'skip'>} */
  componentCommandsOutcomes = {};

  constructor(config) {
    this.version = packageJson.version;
    this.root = path.resolve(config.root) || process.cwd();
    this.logger = new Logger(config.verbose || false, config.disableIO);
    this.stateStorage = new StateStorage(config.stage);
    this.stage = config.stage;
    this.id = undefined;
    this.appName = config.appName;

    this.progresses = new Progresses(this.logger);
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

    this.logger.writeText(
      `\n${prettyoutput(outputs, {
        alignKeyValues: false,
        colors: {
          keys: 'gray',
          dash: 'gray',
          number: 'white',
          true: 'white',
          false: 'white',
        },
      })}`.trimEnd()
    );
  }

  logVerbose(message) {
    this.logger.verbose(message, ['serverless']);
  }

  startInteractiveInput() {
    if (!this.logger.interactiveStdin) {
      return;
    }
    // Start listening to specific keypresses
    readline.emitKeypressEvents(this.logger.interactiveStdin);
    this.logger.interactiveStdin.on('keypress', (character, key) => {
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
    this.logger.interactiveStdin.setRawMode(true);
  }

  shutdown() {
    this.progresses.setFooterText('');
    this.progresses.stopAll();
  }
}

module.exports = Context;
