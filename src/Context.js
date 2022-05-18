'use strict';

const path = require('path');
const prettyoutput = require('prettyoutput');
const utils = require('./utils');
const packageJson = require('../package.json');
const StateStorage = require('./StateStorage');
const S3StateStorage = require('./S3StateStorage');
const Output = require('./cli/Output');
const readline = require('readline');
const Progresses = require('./cli/Progresses');
const colors = require('./cli/colors');
const isPlainObject = require('type/plain-object/is');
const getComposeS3StateBucketName = require('./state/utils/get-compose-s3-state-bucket-name');

class Context {
  constructor(config) {
    this.version = packageJson.version;
    this.root = path.resolve(config.root) || process.cwd();
    this.output = new Output(config.verbose || false, config.disableIO);
    /** @type {string} */
    this.stage = config.stage;
    this.id = undefined;
    this.componentCommandsOutcomes = {};
    this.hasEnabledVerboseInteractively = false;

    this.progresses = new Progresses(this.output);
    if (!config.verbose) {
      this.progresses.setFooterText(colors.gray('Press [?] to enable verbose logs'));
    }

    // Resolved Compose configuration
    this.configuration = config.configuration;

    // TODO: ADD TYPE
    this.stateStorage = null;
  }

  async init() {
    this.startInteractiveInput();
    await this.setupStateStorage();
    const serviceState = await this.stateStorage.readServiceState({ id: utils.randomId() });
    this.id = serviceState.id;
  }

  // TODO: TESTS
  // TODO: REFACTORING & CLEANUP
  // TODO: MAYBE MOVE THIS LOGIC SOMEWHERE ELSE?
  async setupStateStorage() {
    if (!this.configuration.state) {
      this.stateStorage = new StateStorage(this.stage);
    } else if (this.configuration.state === 's3') {
      const bucketName = await getComposeS3StateBucketName({}, this);
      const stateKey = `${this.stage}/state.json`;
      this.stateStorage = new S3StateStorage({ bucketName, stateKey });
    } else if (
      isPlainObject(this.configuration.state) &&
      this.configuration.state.backend === 's3'
    ) {
      const bucketName = await getComposeS3StateBucketName(this.configuration.state, this);
      const stateKey = `${
        this.configuration.state.prefix ? `${this.configuration.state.prefix}/` : ''
      }${this.stage}/state.json`;
      this.stateStorage = new S3StateStorage({ bucketName, stateKey });
    } else {
      // TODO: THROW PROPER ERROR HERE
      throw new Error('invalid state config/backend');
    }
  }

  renderOutputs(outputs) {
    if (typeof outputs !== 'object' || Object.keys(outputs).length === 0) {
      return;
    }

    this.output.writeText(
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
    this.output.verbose(message, ['serverless']);
  }

  startInteractiveInput() {
    if (!this.output.interactiveStdin) {
      return;
    }
    // Start listening to specific keypresses
    readline.emitKeypressEvents(this.output.interactiveStdin);
    this.output.interactiveStdin.on('keypress', (character, key) => {
      if (character === '?') {
        this.output.enableVerbose();
        this.hasEnabledVerboseInteractively = true;
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
    this.output.interactiveStdin.setRawMode(true);
  }

  shutdown() {
    this.progresses.setFooterText('');
    this.progresses.stopAll();
  }
}

module.exports = Context;
