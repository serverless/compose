'use strict';

/**
 * Part of this code was forked from https://github.com/jcarpanelli/spinnies under the MIT license.
 * Copyright 2019 Juan Bautista Carpanelli (jcarpanelli)
 * https://github.com/jcarpanelli/spinnies/blob/master/LICENSE
 */

const cliCursor = require('cli-cursor');
const colors = require('./colors');
const symbols = require('./symbols');
const isUnicodeSupported = require('is-unicode-supported');
const stripAnsi = require('strip-ansi');
const isInteractiveTerminal = require('is-interactive');

const dots = {
  frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
};
// For Windows terminals
const dashes = {
  frames: ['-', '_'],
};

class Progresses {
  /**
   * @type {Record<string, {
   *   text: string;
   *   timer: boolean;
   *   startTime?: number;
   *   endTime?: number;
   *   status: 'spinning'|'success'|'error'|'waiting'|'stopped';
   *   content?: string;
   * }>}
   */
  progresses = {};
  constructor() {
    this.options = {
      spinner: isUnicodeSupported() ? dots : dashes,
    };
    this.isCursorHidden = false;
    this.currentInterval = null;
    this.stream = process.stderr;
    this.lineCount = 0;
    this.currentFrameIndex = 0;
    this.footerText = '';
    this.enabled = isInteractiveTerminal();
    this.bindSigint();
  }

  /**
   * @param {string} name
   * @param {boolean} timer
   */
  add(name, timer = true) {
    this.progresses[name] = {
      status: 'waiting',
      text: 'waiting',
      timer,
    };
    this.updateSpinnerState();
  }

  setFooterText(text) {
    this.footerText = text;
  }

  /**
   * @param {string} name
   * @param {string} text
   */
  start(name, text) {
    if (!this.progresses[name]) {
      this.progresses[name] = {
        timer: true,
      };
    }
    this.progresses[name].status = 'spinning';
    this.progresses[name].text = text;
    this.progresses[name].startTime = Date.now();
    this.updateSpinnerState();
  }

  /**
   * @param {string} name
   * @param {string} text
   */
  update(name, text) {
    if (!this.progresses[name]) throw Error(`No progress with name ${name}`);
    this.progresses[name].text = text;
    this.updateSpinnerState();
  }

  /**
   * @param {string} name
   * @param {string} [text]
   */
  success(name, text) {
    if (!this.progresses[name]) throw Error(`No progress with name ${name}`);
    this.progresses[name].status = 'success';
    if (text) {
      this.progresses[name].text = text;
    }
    this.progresses[name].endTime = Date.now();
    this.updateSpinnerState();
  }

  /**
   * @param {string} name
   * @param {string|Error} [error]
   */
  error(name, error) {
    error = error instanceof Error ? error.message : error;

    if (!this.progresses[name]) throw Error(`No progress with name ${name}`);
    this.progresses[name].status = 'error';
    this.progresses[name].text = 'error';
    this.progresses[name].endTime = Date.now();
    this.progresses[name].content = error;
    this.updateSpinnerState();
  }

  stopAll() {
    Object.keys(this.progresses).forEach((name) => {
      const { status: currentStatus } = this.progresses[name];
      if (currentStatus !== 'error' && currentStatus !== 'success' && currentStatus !== 'waiting') {
        this.progresses[name].status = 'stopped';
      }
    });
    if (this.enabled) {
      this.setStreamOutput();
      this.stream.moveCursor(0, this.lineCount);
      clearInterval(this.currentInterval);
      this.isCursorHidden = false;
      cliCursor.show();
    }
    this.progresses = {};
  }

  updateSpinnerState() {
    if (!this.enabled) return;
    clearInterval(this.currentInterval);
    this.currentInterval = this.loopStream();
    if (!this.isCursorHidden) cliCursor.hide();
    this.isCursorHidden = true;
  }

  loopStream() {
    const { frames } = this.options.spinner;
    const interval = 80;
    return setInterval(() => {
      this.setStreamOutput(frames[this.currentFrameIndex]);
      this.currentFrameIndex =
        this.currentFrameIndex === frames.length - 1 ? 0 : ++this.currentFrameIndex;
    }, interval);
  }

  setStreamOutput(frame = ' ') {
    const separator = colors.gray(symbols.separator);
    // Start with an empty line
    let output = '\n';
    for (const [name, progress] of Object.entries(this.progresses)) {
      let symbol = ' ';
      let componentColor = colors.white;
      let statusColor = colors.white;
      if (progress.status === 'spinning') {
        symbol = frame;
      } else if (progress.status === 'success') {
        symbol = symbols.success;
      } else if (progress.status === 'error') {
        symbol = symbols.error;
        componentColor = colors.red;
        statusColor = colors.red;
      } else if (progress.status === 'waiting') {
        statusColor = colors.gray;
      }
      let line = `${colors.red(symbol)}  ${componentColor(name)} ${separator} ${statusColor(
        progress.text
      )}`;
      if (progress.timer && progress.startTime) {
        const end = progress.endTime ?? Date.now();
        const elapsed = Math.round((end - progress.startTime) / 1000);
        line = `${line} ${separator} ${colors.gray(`${elapsed}s`)}`;
      }
      const indent = 4;
      line = indent ? `${' '.repeat(indent)}${line}` : `${line}`;
      // Avoids spamming the output when the text wraps
      line = this.ellipsis(line);

      // Progresses can have textual content (e.g. error detail)
      if (progress.content) {
        line += `\n\n${progress.content.trim()}\n`;
      }

      output += `${line}\n`;
    }

    if (this.footerText) {
      output += `\n${this.footerText.trim()}\n`;
    }

    output = this.wrapMultilineText(output);
    output = this.limitOutputToTerminalHeight(output);

    // Erase the current progresses output
    this.stream.clearScreenDown();
    // Re-write the updated progresses
    const lineCount = output.split('\n').length - 1;
    this.writeStream(this.stream, output, lineCount);
    this.lineCount = lineCount;
  }

  bindSigint() {
    process.removeAllListeners('SIGINT');
    process.on('SIGINT', () => {
      cliCursor.show();
      this.stream.moveCursor(0, this.lineCount);
      process.exit(0);
    });
  }

  ellipsis(text) {
    const columns = process.stderr.columns || 95;
    const extraCharacters = stripAnsi(text).length - columns;
    // If we go beyond the terminal width, we strip colors (because preserving ANSI while trimming is HARD)
    return extraCharacters > 0
      ? `${stripAnsi(text).substring(0, stripAnsi(text).length - extraCharacters - 1)}…`
      : text;
  }

  wrapMultilineText(text) {
    return text
      .split('\n')
      .map((line) => this.wrapLine(line))
      .join('\n');
  }

  wrapLine(line) {
    const columns = process.stderr.columns || 95;
    const strippedLine = stripAnsi(line);
    const lineLength = strippedLine.length;
    // If the line doesn't wrap, we don't touch it
    if (lineLength <= columns) return line;
    // Else we wrap it explicitly (with \n) and strip ANSI (else we may mess up ANSI code)
    // This is needed because we need to calculate the number of lines to clear, so we
    // need explicit line returns (\n) instead of automatic text wrapping
    return (
      strippedLine.substring(0, columns - 1) +
      `\n` +
      this.wrapLine(strippedLine.substring(columns - 1, strippedLine.length))
    );
  }

  writeStream(stream, output, lineCount) {
    stream.write(output);
    stream.moveCursor(0, -lineCount);
  }

  limitOutputToTerminalHeight(output) {
    if (!this.stream.rows) {
      return;
    }
    const lines = output.split('\n');
    const overflows = lines.length > this.stream.rows;
    return overflows ? lines.slice(-this.stream.rows).join('\n') : output;
  }
}

module.exports = Progresses;
