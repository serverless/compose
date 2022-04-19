'use strict';

const expect = require('chai').expect;
const validateConfiguration = require('../../../../src/configuration/validate');

describe('test/unit/src/configuration/validate.test.js', () => {
  const configurationPath = 'serverless-compose.yml';

  it('rejects non-object config', () => {
    expect(() => validateConfiguration('string', configurationPath))
      .to.throw()
      .and.have.property('code', 'INVALID_NON_OBJECT_CONFIGURATION');
  });

  it('rejects non-object "services" in config', () => {
    expect(() => validateConfiguration({ services: 'string' }, configurationPath))
      .to.throw()
      .and.have.property('code', 'INVALID_NON_OBJECT_SERVICES_CONFIGURATION');
  });

  it('rejects configuration that is missing required keys', () => {
    expect(() => validateConfiguration({}, configurationPath))
      .to.throw()
      .and.have.property('code', 'INVALID_NON_OBJECT_SERVICES_CONFIGURATION');
  });

  it('rejects non-object configuration of specific services', () => {
    expect(() =>
      validateConfiguration(
        {
          services: {
            service: 'string',
          },
        },
        configurationPath
      )
    )
      .to.throw()
      .and.have.property('code', 'INVALID_NON_OBJECT_SERVICE_CONFIGURATION');
  });

  it('rejects configuration of specific services that do not have path defined', () => {
    expect(() =>
      validateConfiguration(
        {
          services: {
            service: {},
          },
        },
        configurationPath
      )
    )
      .to.throw()
      .and.have.property('code', 'MISSING_PATH_IN_SERVICE_CONFIGURATION');
  });

  it('rejects configuration of specific services that have path definition of root compose service', () => {
    expect(() =>
      validateConfiguration(
        {
          services: {
            service: { path: '.' },
          },
        },
        configurationPath
      )
    )
      .to.throw()
      .and.have.property('code', 'INVALID_PATH_IN_SERVICE_CONFIGURATION');
  });

  it('rejects configuration that contains Framework-specific properties', () => {
    expect(() =>
      validateConfiguration(
        {
          services: {},
          provider: {},
        },
        configurationPath
      )
    )
      .to.throw()
      .and.have.property('code', 'INVALID_CONFIGURATION');
  });

  it('rejects configuration with unknown properties', () => {
    expect(() =>
      validateConfiguration(
        {
          services: {},
          foo: '',
        },
        configurationPath
      )
    )
      .to.throw()
      .and.have.property('code', 'INVALID_CONFIGURATION');
  });

  it('accepts valid configuration', () => {
    expect(() =>
      validateConfiguration(
        {
          services: {},
        },
        configurationPath
      )
    ).not.to.throw();
  });
});
