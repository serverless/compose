'use strict';

const Component = require('./Component');

class ServerlessError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

module.exports = {
  Component,
  ServerlessError,
};
