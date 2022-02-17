const os = require('os');
const chalk = require('chalk');
const ansiEscapes = require('ansi-escapes');
const stripAnsi = require('strip-ansi');
const figures = require('figures');
const path = require('path');
const prettyoutput = require('prettyoutput');
const utils = require('./utils');
const packageJson = require('../package.json');
const StateStorage = require('./StateStorage');
const chokidar = require('chokidar');

// Serverless Components CLI Colors
const grey = chalk.dim;
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
    this._.useTimer = true;
    this._.seconds = 0;
  }

  async init() {
    const serviceState = this.stateStorage.readServiceState({ id: utils.randomId() });
    this.id = serviceState.id;
  }

  resourceId() {
    return `${this.id}-${utils.randomId()}`;
  }

  getRelativeVerticalCursorPosition(contentString) {
    const base = 1;
    const terminalWidth = process.stdout.columns;
    const contentWidth = stripAnsi(contentString).length;
    const nudges = Math.ceil(Number(contentWidth) / Number(terminalWidth));
    return base + nudges;
  }

  renderLog(msg) {
    if (!msg || msg == '') {
      console.log(); // eslint-disable-line
      return;
    }

    // Clear any existing content
    process.stdout.write(ansiEscapes.eraseDown);
    console.log(); // eslint-disable-line

    console.log(`${msg}`); // eslint-disable-line

    // Put cursor to starting position for next view
    process.stdout.write(ansiEscapes.cursorLeft);
  }

  renderDebug(msg) {
    if (!this.debugMode || !msg || msg == '') {
      return;
    }

    // Clear any existing content
    process.stdout.write(ansiEscapes.eraseDown);

    console.log(`${grey.bold(`DEBUG ${figures.line}`)} ${chalk.white(msg)}`); // eslint-disable-line

    // Put cursor to starting position for next view
    process.stdout.write(ansiEscapes.cursorLeft);
  }

  renderError(error, entity) {
    if (typeof error === 'string') {
      error = new Error(error);
    }

    // If no argument, skip
    if (!error || error === '') {
      return;
    }

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
    // Clear any existing content
    process.stdout.write(ansiEscapes.eraseDown);
    console.log(); // eslint-disable-line
    process.stdout.write(prettyoutput(outputs)); // eslint-disable-line
  }

  // basic CLI utilities
  log(msg) {
    this.renderLog(msg);
  }

  debug(msg) {
    this.renderDebug(msg);
  }
}

module.exports = Context;
