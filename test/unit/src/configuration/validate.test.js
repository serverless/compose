'use strict';

const expect = require('chai').expect;
const validateConfiguration = require('../../../../src/configuration/validate');

describe('test/unit/src/configuration/validate.test.js', () => {
  it('validates the configuration', () => {
    // Not an object
    expect(() => validateConfiguration('string')).to.throw();
    // Missing required keys
    expect(() => validateConfiguration({})).to.throw();
    // Contains Framework keys
    expect(() =>
      validateConfiguration({
        name: 'my-app',
        services: [],
        provider: {},
      })
    ).to.throw();
    // Contains unknown keys
    expect(() =>
      validateConfiguration({
        name: 'my-app',
        services: [],
        foo: '',
      })
    ).to.throw();
    // Valid config
    expect(() =>
      validateConfiguration({
        name: 'my-app',
        services: [],
      })
    ).not.to.throw();
  });
});
