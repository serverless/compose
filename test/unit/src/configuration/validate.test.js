'use strict';

const expect = require('chai').expect;
const validateConfiguration = require('../../../../src/configuration/validate');

describe('test/unit/src/configuration/validate.test.js', () => {
  const configurationPath = 'serverless-compose.yml';
  it('validates the configuration', () => {
    // Not an object
    expect(() => validateConfiguration('string', configurationPath)).to.throw();
    // Missing required keys
    expect(() => validateConfiguration({}, configurationPath)).to.throw();
    // Contains Framework keys
    expect(() =>
      validateConfiguration(
        {
          name: 'my-app',
          services: [],
          provider: {},
        },
        configurationPath
      )
    ).to.throw();
    // Contains unknown keys
    expect(() =>
      validateConfiguration(
        {
          name: 'my-app',
          services: [],
          foo: '',
        },
        configurationPath
      )
    ).to.throw();
    // Valid config
    expect(() =>
      validateConfiguration(
        {
          name: 'my-app',
          services: [],
        },
        configurationPath
      )
    ).not.to.throw();
  });
});
