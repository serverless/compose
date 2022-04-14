'use strict';

// @ts-nocheck Types do not work with chalk for some reason
const chalk = require('chalk');

const colorSupportLevel = chalk.supportsColor ? chalk.supportsColor.level : 0;

module.exports = {
  foreground: chalk.reset,
  gray: colorSupportLevel > 2 ? chalk.rgb(140, 141, 145) : chalk.gray,
  red: colorSupportLevel > 2 ? chalk.rgb(253, 87, 80) : chalk.redBright,
  warning: chalk.rgb(255, 165, 0),
};
