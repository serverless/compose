'use strict';

const YAML = require('js-yaml');
const { curryN, mergeRight } = require('ramda');
const isJsonPath = require('./isJsonPath');
const isYamlPath = require('./isYamlPath');

const parseFile = curryN(2, (filePath, contents, options = {}) => {
  if (isJsonPath(filePath)) {
    return JSON.parse(contents);
  } else if (isYamlPath(filePath)) {
    return YAML.load(contents.toString(), mergeRight(options, { filename: filePath }));
  } else if (filePath.endsWith('.slsignore')) {
    return contents.toString().split('\n');
  }
  return contents.toString().trim();
});

module.exports = parseFile;
