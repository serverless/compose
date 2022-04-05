'use strict';

/**
 * Safely writes text to a stream.
 * It takes into account dynamic content that may be written below.
 * @param {string} text
 * @param {NodeJS.WritableStream | NodeJS.WriteStream} stream
 */
function safeWrite(text, stream) {
  text = text ?? '';
  for (const line of text.split('\n')) {
    // This writes from the cursor
    stream.write(line);
    // But maybe the line already contained content (e.g. a progress)
    // so we clear the rest of line, up till its end (on the right side)
    if (isInteractiveStream(stream)) {
      stream.clearLine(1);
    }
    // Then we can add a line return
    stream.write('\n');
  }
}

/**
 * @return {stream is NodeJS.WriteStream}
 */
function isInteractiveStream(stream) {
  return typeof stream.clearLine === 'function';
}

module.exports = { safeWrite };
