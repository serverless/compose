const fs = require('./fs');
const load = require('./load');
const sleep = require('./sleep');
const randomId = require('./randomId');

module.exports = {
  ...fs,
  load,
  sleep,
  randomId,
};
