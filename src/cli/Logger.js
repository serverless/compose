const colors = require('./colors');
const symbols = require('./symbols');
const { safeWrite } = require('./output');

class Logger {
  /** @type {[{ namespace?: string[], message: string }]} */
  verboseLogs = [];

  /**
   * @param {boolean} verboseMode
   */
  constructor(verboseMode) {
    this.verboseMode = verboseMode;
  }

  /**
   * Writes text to stdout.
   * @param {string} message
   * @param {string[]} [namespace]
   */
  writeText(message, namespace = []) {
    safeWrite(message, process.stdout, this.generatePrefix(namespace));
  }

  /**
   * Writes logs to stderr.
   * @param {string} [message]
   * @param {string[]} [namespace]
   */
  log(message, namespace = []) {
    safeWrite(message, process.stderr, this.generatePrefix(namespace));
  }

  /**
   * @param {string} message
   * @param {string[]} [namespace]
   */
  verbose(message, namespace) {
    if (!message || message === '') return;
    if (this.verboseMode) {
      this.log(colors.gray(message), namespace);
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
    if (this.verboseMode && error.stack) {
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
      this.verbose(message, namespace);
    });
    this.verboseLogs = [];
  }

  /**
   * @param {string[]} namespace
   * @return string
   */
  generatePrefix(namespace) {
    let prefix = namespace.join(` ${symbols.separator} `);
    if (prefix.length > 0) {
      prefix = colors.gray(`${prefix} ${symbols.separator} `);
    }
    return prefix;
  }
}

module.exports = Logger;
