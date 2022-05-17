'use strict';

const { resolve } = require('path');
const ComponentContext = require('./ComponentContext');

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
  const externalComponentPath = resolve(context.root, path, 'serverless.js');

  /** @type {typeof import('./Component')} */
  const ComponentClass = require(externalComponentPath);

  const componentId = alias || ComponentClass.name;
  const componentContext = new ComponentContext(componentId, context);
  await componentContext.init();

  return new ComponentClass(componentId, componentContext, inputs);
}

module.exports = { loadComponent };
