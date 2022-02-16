const readline = require("readline");

/**
 * Safely write a log line to stderr.
 *
 * It takes into account dynamic content that may be written below.
 *
 * @param {string} [message]
 */
function log(message) {
    // This writes from the cursor
    process.stderr.write(message ?? '');
    // But maybe the line already contained content (e.g. a progress)
    // so we clear the rest of line, up till its end (on the right side)
    readline.clearLine(process.stderr, 1);
    // Then we can add a line return
    process.stderr.write('\n');
}

module.exports = {
    log,
};
