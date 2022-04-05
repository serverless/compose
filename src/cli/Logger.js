'use strict';

const colors = require('./colors');
const symbols = require('./symbols');
const { safeWrite } = require('./output');
const fs = require('fs');
const stripAnsi = require('strip-ansi');
const path = require('path');

class Logger {
  /** @type {Array<{ namespace?: string[], message: string }>} */
  verboseLogs = [];
  logsFilePath = '.serverless/compose.log';

  /**
   * @param {boolean} verboseMode
   * @param {Record<string, NodeJS.WritableStream>} [streams] To allow mocking in tests
   */
  constructor(verboseMode, streams) {
    this.verboseMode = verboseMode;
    this.stdout = streams?.stdout ? streams.stdout : process.stdout;
    this.stderr = streams?.stderr ? streams.stderr : process.stderr;
    this.logsFileStream = streams?.logsFileStream ? streams.logsFileStream : this.openLogsFile();
  }

  /**
   * Writes text to stdout.
   * @param {string} message
   * @param {string[]} [namespace]
   */
  writeText(message, namespace = []) {
    message = this.namespaceLogMessage(message, namespace);
    safeWrite(message, this.stdout);
    this.writeToLogsFile(message);
  }

  /**
   * Writes logs to stderr.
   * @param {string} [message]
   * @param {string[]} [namespace]
   */
  log(message, namespace = []) {
    message = this.namespaceLogMessage(message, namespace);
    safeWrite(message, this.stderr);
    this.writeToLogsFile(message);
  }

  /**
   * @param {string} message
   * @param {string[]} [namespace]
   */
  verbose(message, namespace) {
    if (!message || message === '') return;

    this.writeToLogsFile(message);

    if (this.verboseMode) {
      this.doLogVerbose(message, namespace);
    } else {
      this.verboseLogs.push({
        message,
        namespace,
      });
    }
  }

  /**
   * @param {string|Error} error
   * @param {string[]} [namespace]
   */
  error(error, namespace = []) {
    if (this.verboseMode && error instanceof Error) {
      // Print the stack trace in verbose mode
      this.log(`${colors.red('Error:')} ${error.stack}`, namespace);
    } else {
      error = error instanceof Error ? error.message : error;
      this.log(`${colors.red('Error:')} ${error}`, namespace);
    }
  }

  enableVerbose() {
    this.verboseMode = true;
    // Flush all previous verbose logs to the output
    this.verboseLogs.forEach(({ message, namespace }) => {
      this.doLogVerbose(message, namespace);
    });
    this.verboseLogs = [];
  }

  /**
   * @private
   * @param {string} message
   * @param {string[]} [namespace]
   */
  doLogVerbose(message, namespace) {
    message = colors.gray(message);
    message = this.namespaceLogMessage(message, namespace);
    safeWrite(message, this.stderr);
  }

  /**
   * @private
   * @param {string} text
   */
  writeToLogsFile(text) {
    text = stripAnsi(text);
    this.logsFileStream.write(`${text}\n`);
  }

  /**
   * @private
   * @param {string|undefined} text
   * @param {string[]} [namespace]
   * @return {string}
   */
  namespaceLogMessage(text, namespace) {
    text = text ?? '';
    const prefix = this.generatePrefix(namespace);
    return text
      .split('\n')
      .map((line) => `${prefix}${line}`)
      .join('\n');
  }

  /**
   * @private
   * @param {string[]} [namespace]
   * @return string
   */
  generatePrefix(namespace) {
    if (!namespace) {
      return '';
    }
    let prefix = namespace.join(` ${symbols.separator} `);
    if (prefix.length > 0) {
      prefix = colors.gray(`${prefix} ${symbols.separator} `);
    }
    return prefix;
  }

  openLogsFile() {
    const directory = path.dirname(this.logsFilePath);
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory);
    }
    return fs.createWriteStream(this.logsFilePath);
  }
}

module.exports = Logger;
