const colors = require('./colors');
const symbols = require('./symbols');

class Logger {
  /**
   * @type {[{ namespace: string, message: string }]}
   */
  verboseLogs = [];

  /**
   * @param {boolean} verboseMode
   */
  constructor(verboseMode) {
    this.verboseMode = verboseMode;
  }

  /**
   * Safely write a log line to stderr.
   * It takes into account dynamic content that may be written below.
   * @param {string} [message]
   */
  log(message) {
    message = message ?? '';
    for (const line of message.split('\n')) {
      // This writes from the cursor
      process.stderr.write(line);
      // But maybe the line already contained content (e.g. a progress)
      // so we clear the rest of line, up till its end (on the right side)
      process.stderr.clearLine(1);
      // Then we can add a line return
      process.stderr.write('\n');
    }
  }

  /**
   * @param {string} namespace
   * @param {string} message
   */
  verbose(namespace, message) {
    if (!message || message === '') return;
    if (this.verboseMode) {
      this.log(`${colors.gray(`${namespace} ${symbols.separator}`)} ${message}`);
    } else {
      this.verboseLogs.push({
        namespace,
        message,
      });
    }
  }

  /**
   * @param {string|Error} [error]
   */
  error(error) {
    if (this.verboseMode && error.stack) {
      this.log(`${colors.red('Error:')} ${error.stack}`);
    } else {
      error = error instanceof Error ? error.message : error;
      this.log(`${colors.red('Error:')} ${error}`);
    }
  }

  enableVerbose() {
    this.verboseMode = true;
    // Flush all previous verbose logs to the output
    this.verboseLogs.forEach(({ namespace, message }) => {
      this.verbose(namespace, message);
    });
    this.verboseLogs = [];
  }
}

module.exports = Logger;
