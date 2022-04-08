'use strict';

const slscVersion = require('../package').version;
const tokenizeException = require('./utils/tokenize-exception');
const colors = require('./cli/colors');

/**
 * @param {import('./cli/Output')} output
 */
module.exports = (exception, output) => {
  const exceptionTokens = tokenizeException(exception);
  const isUserError = exceptionTokens.isUserError;

  const platform = process.platform;
  const nodeVersion = process.version.replace(/^[v|V]/, '');

  const detailsTextTokens = [
    `Environment: ${platform}, node ${nodeVersion}, compose ${slscVersion}`,
  ];

  detailsTextTokens.push(
    'Docs:        github.com/serverless/compose',
    'Bugs:        github.com/serverless/compose/issues'
  );

  output.log(colors.darkGray(detailsTextTokens.join('\n')));
  output.log();

  const errorMsg =
    exceptionTokens.stack && !isUserError ? exceptionTokens.stack : exceptionTokens.message;
  output.writeText(`${colors.red('Error:')}\n${errorMsg}`);

  output.log();
  output.log(colors.darkGray('Verbose logs are available in ".serverless/compose.log"'));

  process.exitCode = 1;
};
