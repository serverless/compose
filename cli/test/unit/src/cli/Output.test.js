'use strict';

const expect = require('chai').expect;
const Output = require('../../../../src/cli/Output');
const colors = require('../../../../src/cli/colors');
const readStream = require('../../read-stream');

describe('test/unit/lib/cli/Output.test.js', () => {
  /** @type {Output} */
  let output;
  beforeEach(() => {
    output = new Output(false, true);
  });

  it('writes text', async () => {
    output.writeText('Message');

    expect(await readStream(output.stdout)).to.equal('Message\n');
    expect(await readStream(output.stderr)).to.equal('');
    expect(await readStream(output.logsFileStream)).to.equal('Message\n');
  });

  it('can namespace text', async () => {
    output.writeText('Message with\nmultiple lines', ['foo', 'bar']);

    expect(await readStream(output.stdout)).to.equal(
      `${colors.gray('foo › bar › ')}Message with\n` +
        // We check that the namespace is applied to all lines
        `${colors.gray('foo › bar › ')}multiple lines\n`
    );
    expect(await readStream(output.stderr)).to.equal('');
    expect(await readStream(output.logsFileStream)).to.equal(
      'foo › bar › Message with\nfoo › bar › multiple lines\n'
    );
  });

  it('strips colors when logging into the log file', async () => {
    output.writeText(colors.gray('Message'));

    // Logged with colors on stdout
    expect(await readStream(output.stdout)).to.equal(`${colors.gray('Message')}\n`);
    expect(await readStream(output.stderr)).to.equal('');
    // But written without colors into the log file
    expect(await readStream(output.logsFileStream)).to.equal('Message\n');
  });

  it('can hold verbose logs', async () => {
    output.verbose('Message');

    expect(await readStream(output.stdout)).to.equal('');
    // Verbose logs are NOT written to stderr
    expect(await readStream(output.stderr)).to.equal('');
    // But they are written to the log file
    expect(await readStream(output.logsFileStream)).to.equal('Message\n');
  });

  it('can write verbose logs', async () => {
    output = new Output(true, true);

    output.verbose('Message', ['foo']);

    expect(await readStream(output.stdout)).to.equal('');
    // Verbose logs are written (with colors) to stderr
    expect(await readStream(output.stderr)).to.equal(
      `${colors.gray('foo › ')}${colors.gray('Message')}\n`
    );
    // And (without colors) to the log file
    expect(await readStream(output.logsFileStream)).to.equal('foo › Message\n');
  });

  it('can switch to verbose logs at runtime', async () => {
    output.verbose('Message 1');
    output.enableVerbose();
    output.verbose('Message 2');

    expect(await readStream(output.stdout)).to.equal('');
    expect(await readStream(output.stderr)).to.equal(
      `${colors.gray('Message 1')}\n${colors.gray('Message 2')}\n`
    );
    expect(await readStream(output.logsFileStream)).to.equal('Message 1\nMessage 2\n');
  });

  it('logs errors', async () => {
    output.error('A text error');
    output.error(new Error('An error'));

    expect(await readStream(output.stdout)).to.equal('');
    expect(await readStream(output.stderr)).to.equal(
      `${colors.red('Error:')} A text error\n${colors.red('Error:')} An error\n`
    );
    expect(await readStream(output.logsFileStream)).to.equal(
      'Error: A text error\nError: An error\n'
    );
  });

  it('logs errors with stack traces in verbose', async () => {
    output = new Output(true, true);

    output.error(new TypeError('An error'));

    expect(await readStream(output.stdout)).to.equal('');
    expect(await readStream(output.stderr)).to.contain(
      `${colors.red('Error:')} TypeError: An error\n    at Context.<anonymous>`
    );
    expect(await readStream(output.logsFileStream)).to.contain(
      'Error: TypeError: An error\n    at Context.<anonymous>'
    );
  });
});
