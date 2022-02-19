const os = require('os');
const figures = require('figures');
const path = require('path');
const prettyoutput = require('prettyoutput');
const utils = require('./utils');
const packageJson = require('../package.json');
const StateStorage = require('./StateStorage');
const chokidar = require('chokidar');
const Logger = require('./cli/Logger');
const readline = require('readline');

class Context {
  stateStorage;
  constructor(config) {
    this.version = packageJson.version;
    this.root = path.resolve(config.root) || process.cwd();
    this.logger = new Logger(config.verbose || false);

    /**
     * @type {StateStorage}
     */
    this.stateStorage = new StateStorage(config.stage);
    this.stage = config.stage;
    this.id = undefined;

    // todo remove later when we update components
    this.outputs = {};

    // Defaults
    this._ = {};
    this._.entity = 'Components';
  }

  async init() {
    this.startInteractiveInput();

    const serviceState = this.stateStorage.readServiceState({ id: utils.randomId() });
    this.id = serviceState.id;
  }

  resourceId() {
    return `${this.id}-${utils.randomId()}`;
  }

  renderOutputs(outputs) {
    if (typeof outputs !== 'object' || Object.keys(outputs).length === 0) {
      return;
    }
    process.stdout.write('\n');
    process.stdout.write(
      prettyoutput(outputs, {
        colors: {
          keys: 'gray',
          dash: 'gray',
          number: 'white',
          true: 'white',
          false: 'white',
        },
      })
    );
  }

  logVerbose(message) {
    this.logger.verbose('serverless', message);
  }

  startInteractiveInput() {
    // Start listening to specific keypresses
    readline.emitKeypressEvents(process.stdin);
    process.stdin.on('keypress', (character, key) => {
      if (character === '?') {
        this.logger.enableVerbose();
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
}

module.exports = Context;
