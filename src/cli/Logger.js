const colors = require('./colors');
const symbols = require('./symbols');

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
   * Safely writes text to stdout.
   * It takes into account dynamic content that may be written below.
   * @param {string} message
   * @param {string[]} [namespace]
   */
  writeText(message, namespace = []) {
    const prefix = this.generatePrefix(namespace);
    message = message ?? '';
    for (const line of message.split('\n')) {
      // This writes from the cursor
      process.stdout.write(`${prefix}${line}`);
      // But maybe the line already contained content (e.g. a progress)
      // so we clear the rest of line, up till its end (on the right side)
      process.stdout.clearLine(1);
      // Then we can add a line return
      process.stdout.write('\n');
    }
  }

  /**
   * Safely write logs to stderr.
   * It takes into account dynamic content that may be written below.
   * @param {string} [message]
   * @param {string[]} [namespace]
   */
  log(message, namespace = []) {
    const prefix = this.generatePrefix(namespace);
    message = message ?? '';
    for (const line of message.split('\n')) {
      // This writes from the cursor
      process.stderr.write(`${prefix}${line}`);
      // But maybe the line already contained content (e.g. a progress)
      // so we clear the rest of line, up till its end (on the right side)
      process.stderr.clearLine(1);
      // Then we can add a line return
      process.stderr.write('\n');
    }
  }

  /**
   * @param {string} message
   * @param {string[]} [namespace]
   */
  verbose(message, namespace) {
    if (!message || message === '') return;
    if (this.verboseMode) {
      this.log(message, namespace);
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
