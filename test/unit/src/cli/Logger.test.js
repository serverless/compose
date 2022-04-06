'use strict';

const expect = require('chai').expect;
const Logger = require('../../../../src/cli/Logger');
const colors = require('../../../../src/cli/colors');
const readStream = require('../../read-stream');

describe('test/unit/lib/cli/Logger.test.js', () => {
  /** @type {Logger} */
  let logger;
  beforeEach(() => {
    logger = new Logger(false, true);
  });

  it('writes text', async () => {
    logger.writeText('Message');

    expect(await readStream(logger.stdout)).to.equal('Message\n');
    expect(await readStream(logger.stderr)).to.equal('');
    expect(await readStream(logger.logsFileStream)).to.equal('Message\n');
  });

  it('can namespace text', async () => {
    logger.writeText('Message with\nmultiple lines', ['foo', 'bar']);

    expect(await readStream(logger.stdout)).to.equal(
      `${colors.gray('foo › bar › ')}Message with\n` +
        // We check that the namespace is applied to all lines
        `${colors.gray('foo › bar › ')}multiple lines\n`
    );
    expect(await readStream(logger.stderr)).to.equal('');
    expect(await readStream(logger.logsFileStream)).to.equal(
      'foo › bar › Message with\nfoo › bar › multiple lines\n'
    );
  });

  it('strips colors when logging into the log file', async () => {
    logger.writeText(colors.gray('Message'));

    // Logged with colors on stdout
    expect(await readStream(logger.stdout)).to.equal(`${colors.gray('Message')}\n`);
    expect(await readStream(logger.stderr)).to.equal('');
    // But written without colors into the log file
    expect(await readStream(logger.logsFileStream)).to.equal('Message\n');
  });

  it('can hold verbose logs', async () => {
    logger.verbose('Message');

    expect(await readStream(logger.stdout)).to.equal('');
    // Verbose logs are NOT written to stderr
    expect(await readStream(logger.stderr)).to.equal('');
    // But they are written to the log file
    expect(await readStream(logger.logsFileStream)).to.equal('Message\n');
  });

  it('can write verbose logs', async () => {
    logger = new Logger(true, true);

    logger.verbose('Message');

    expect(await readStream(logger.stdout)).to.equal('');
    // Verbose logs are written (with colors) to stderr
    expect(await readStream(logger.stderr)).to.equal(`${colors.gray('Message')}\n`);
    // And (without colors) to the log file
    expect(await readStream(logger.logsFileStream)).to.equal('Message\n');
  });

  it('can switch to verbose logs at runtime', async () => {
    logger.verbose('Message 1');
    logger.enableVerbose();
    logger.verbose('Message 2');

    expect(await readStream(logger.stdout)).to.equal('');
    expect(await readStream(logger.stderr)).to.equal(
      `${colors.gray('Message 1')}\n${colors.gray('Message 2')}\n`
    );
    expect(await readStream(logger.logsFileStream)).to.equal('Message 1\nMessage 2\n');
  });

  it('logs errors', async () => {
    logger.error('A text error');
    logger.error(new Error('An error'));

    expect(await readStream(logger.stdout)).to.equal('');
    expect(await readStream(logger.stderr)).to.equal(
      `${colors.red('Error:')} A text error\n${colors.red('Error:')} An error\n`
    );
    expect(await readStream(logger.logsFileStream)).to.equal(
      'Error: A text error\nError: An error\n'
    );
  });

  it('logs errors with stack traces in verbose', async () => {
    logger = new Logger(true, true);

    logger.error(new TypeError('An error'));

    expect(await readStream(logger.stdout)).to.equal('');
    expect(await readStream(logger.stderr)).to.contain(
      `${colors.red('Error:')} TypeError: An error\n    at Context.<anonymous>`
    );
    expect(await readStream(logger.logsFileStream)).to.contain(
      'Error: TypeError: An error\n    at Context.<anonymous>'
    );
  });
});
