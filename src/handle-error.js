'use strict';

const slscVersion = require('../package').version;
const tokenizeException = require('./utils/tokenize-exception');
const colors = require('./cli/colors');

module.exports = (exception, logger) => {
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

  logger.log(colors.darkGray(detailsTextTokens.join('\n')));
  logger.log();

  const errorMsg =
    exceptionTokens.stack && !isUserError ? exceptionTokens.stack : exceptionTokens.message;
  logger.writeText(`${colors.red('Error:')}\n${errorMsg}`);

  process.exitCode = 1;
};
