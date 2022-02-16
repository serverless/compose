const os = require('os');
const chalk = require('chalk');
const ansiEscapes = require('ansi-escapes');
const figures = require('figures');
const path = require('path');
const prettyoutput = require('prettyoutput');
const utils = require('./utils');
const packageJson = require('../package.json');
const StateStorage = require('./StateStorage');
const chokidar = require('chokidar');
const colors = require("./cli/colors");
const symbols = require("./cli/symbols");
const {log} = require("./cli/log");

// Serverless Components CLI Colors
const red = chalk.hex('fd5750');

class Context {
  stateStorage;
  constructor(config) {
    this.version = packageJson.version;
    this.root = path.resolve(config.root) || process.cwd();

    this.debugMode = config.debug || false;
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
    const serviceState = this.stateStorage.readServiceState({ id: utils.randomId() });
    this.id = serviceState.id;
  }

  resourceId() {
    return `${this.id}-${utils.randomId()}`;
  }

  renderError(error, entity) {
    if (typeof error === 'string') {
      error = new Error(error);
    }

    // If no argument, skip
    if (!error || error === '') {
      return;
    }

    // TODO refactor that to be compatible with progresses

    // Clear any existing content
    process.stdout.write(ansiEscapes.eraseDown);
    console.log(); // eslint-disable-line

    // Write Error
    if (entity) {
      entity = `${red(entity)} ${red(figures.pointerSmall)} ${red(`error:`)}`;
      console.log(`${entity}`); // eslint-disable-line
    } else {
      console.log(`${red('error:')}`); // eslint-disable-line
    }
    console.log(` `, error); // eslint-disable-line

    // Put cursor to starting position for next view
    process.stdout.write(ansiEscapes.cursorLeft);
  }

  renderOutputs(outputs) {
    if (typeof outputs !== 'object' || Object.keys(outputs).length === 0) {
      return;
    }
    process.stdout.write('');
    process.stdout.write(prettyoutput(outputs));
  }

  debug(msg, component = 'serverless') {
    if (!this.debugMode || !msg || msg === '') {
      return;
    }
    log(`${colors.gray(`${component} ${symbols.separator}`)} ${msg}`);
  }
}

module.exports = Context;
