'use strict';

const fs = require('./fs');
const randomId = require('./randomId');

module.exports = {
  ...fs,
  randomId,
};
