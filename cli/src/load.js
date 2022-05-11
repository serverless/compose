'use strict';

const ComponentContext = require('./ComponentContext');

/**
 * @param {{
 *     context: import('./Context'),
 *     path: string,
 *     alias: string,
 *     inputs: Record<string, any>,
 * }} param
 * @return {Promise<import('@serverless-components/core').Component>}
 */
async function loadComponent({ context, path, alias, inputs }) {
  const ComponentClass = require(path);

  const componentId = alias || ComponentClass.name;
  const componentContext = new ComponentContext(componentId, context);
  await componentContext.init();

  return new ComponentClass(componentId, componentContext, inputs);
}

module.exports = { loadComponent };
