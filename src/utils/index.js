'use strict';

const fs = require('./fs');
const sleep = require('./sleep');
const randomId = require('./randomId');

module.exports = {
  ...fs,
  sleep,
  randomId,
};
