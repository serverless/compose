'use strict';

const ComponentContext = require('./ComponentContext');
const ServerlessError = require('./serverless-error');

/**
 * @param {{
 *     context: import('./Context'),
 *     path: string,
 *     alias: string,
 *     inputs: Record<string, any>,
 * }} param
 * @return {Promise<import('./Component')>}
 */
async function loadComponent({ context, path, alias, inputs }) {
  /** @type {typeof import('./Component')} */
  const ComponentClass = require(path);

  if (typeof ComponentClass !== 'function') {
    throw new ServerlessError(
      `Component type "${path}" (service "${alias}") is invalid: "${path}" does not returns a component class`,
      'UNRECOGNIZED_COMPONENT'
    );
  }

  const componentId = alias || ComponentClass.name;
  const componentContext = new ComponentContext(componentId, context);
  await componentContext.init();

  return new ComponentClass(componentId, componentContext, inputs);
}

module.exports = { loadComponent };
