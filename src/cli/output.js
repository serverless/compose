/**
 * Safely writes text to a stream.
 * It takes into account dynamic content that may be written below.
 * @param {string} text
 * @param {NodeJS.WriteStream} stream
 * @param {string} [prefix] Prefix to add before each line
 */
function safeWrite(text, stream, prefix = '') {
  text = text ?? '';
  for (const line of text.split('\n')) {
    // This writes from the cursor
    stream.write(`${prefix}${line}`);
    // But maybe the line already contained content (e.g. a progress)
    // so we clear the rest of line, up till its end (on the right side)
    stream.clearLine(1);
    // Then we can add a line return
    stream.write('\n');
  }
}

module.exports = { safeWrite };
