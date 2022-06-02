'use strict';

const expect = require('chai').expect;
const {
  validateConfiguration,
  validateComponentInputs,
} = require('../../../../src/configuration/validate');

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

  it('rejects invalid component inputs', () => {
    // This test validates multiple scenarios of different error messages
    const schema = {
      type: 'object',
      properties: {
        path: { type: 'string' },
        params: {
          type: 'object',
          additionalProperties: {
            type: 'string',
          },
        },
      },
      required: ['path', 'export'],
      additionalProperties: false,
    };
    const inputs = {
      // The component field is always passed but components don't have to
      // declare it in their schemas, it's validated automatically
      component: 'serverless-framework',
      // `dependsOn` is applicable to all components, it's also validated implicitly
      dependsOn: ['foo'],
      // Invalid type
      path: 123,
      // Extra property
      foo: 'bar',
      // Invalid type in nested object
      params: {
        foo: 123,
      },
      // Missing property "export"
    };
    const expectedMessage =
      'Invalid configuration for component "id":\n' +
      "- must have required property 'export'\n" +
      '- unknown property "foo"\n' +
      '- "path": must be string\n' +
      '- "params.foo": must be string';
    expect(() => validateComponentInputs('id', schema, inputs))
      .to.throw()
      .and.have.property('message', expectedMessage);
  });
});
