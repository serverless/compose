'use strict';

const { resolve } = require('path');
const ComponentContext = require('./ComponentContext');

/**
 * @return {Promise<import('@serverless/components').Component>}
 */
async function loadComponent({ context, path, alias, inputs }) {
  const externalComponentPath = resolve(context.root, path, 'serverless.js');

  const ComponentClass = require(externalComponentPath);

  const componentId = alias || ComponentClass.name;
  const componentContext = new ComponentContext(componentId, context);

  const component = new ComponentClass(componentId, componentContext, inputs);

  // populate state based on the component id
  await component.init();

  return component;
}

module.exports = { loadComponent };
