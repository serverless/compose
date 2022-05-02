'use strict';

const { resolve } = require('path');

/**
 * @return {Promise<import('./Component')>}
 */
async function loadComponent({ context, path, alias, inputs }) {
  const externalComponentPath = resolve(context.root, path, 'serverless.js');

  const ComponentClass = require(externalComponentPath);

  const componentId = alias || ComponentClass.name;
  const component = new ComponentClass(componentId, context, inputs);

  // populate state based on the component id
  await component.init();

  return component;
}

module.exports = { loadComponent };
