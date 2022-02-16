'use strict';

// Setup log writing
require('@serverless/utils/log-reporters/node');

const path = require('path');
const args = require('minimist')(process.argv.slice(2));
const utils = require('./utils');
const Context = require('./Context');
const Component = require('./Component');
const ComponentsService = require('./ComponentsService');

// Simplified support only for yml
const getServerlessFile = (dir) => {
  const ymlFilePath = path.join(dir, 'serverless.yml');
  const yamlFilePath = path.join(dir, 'serverless.yaml');

  try {
    if (utils.fileExistsSync(ymlFilePath)) {
      return utils.readFileSync(ymlFilePath);
    }
    if (utils.fileExistsSync(yamlFilePath)) {
      return utils.readFileSync(yamlFilePath);
    }
  } catch (e) {
    // todo currently our YAML parser does not support
    // CF schema (!Ref for example). So we silent that error
    // because the framework can deal with that
    if (e.name !== 'YAMLException') {
      throw e;
    }
  }

  return false;
};

const isComponentsTemplate = (serverlessFile) => {
  if (typeof serverlessFile !== 'object') {
    return false;
  }

  // make sure it's NOT a framework file
  if (serverlessFile.provider && serverlessFile.provider.name) {
    return false;
  }

  // make sure it IS a components file
  for (const key in serverlessFile) {
    if (serverlessFile[key] && serverlessFile[key].component) {
      return true;
    }
  }

  return false;
};

const isComponentsFile = (serverlessFile) => {
  if (typeof serverlessFile === 'function' || isComponentsTemplate(serverlessFile)) {
    return true;
  }
  return false;
};

const runComponents = async () => {
  const serverlessFile = getServerlessFile(process.cwd());

  if (!serverlessFile || !isComponentsFile(serverlessFile)) {
    return;
  }

  let method = args._[0];
  if (!method) {
    throw new Error('Please provide a method that should be run.');
  }
  let componentName;
  if (method.includes(':')) {
    let methods;
    [componentName, ...methods] = method.split(':');
    method = methods.join(':');
  }
  const options = args;
  delete options._; // remove the method name if any

  if (!isComponentsTemplate(serverlessFile)) {
    throw new Error('serverless.yml component file not found');
  }

  const config = {
    root: process.cwd(),
    stateRoot: path.join(process.cwd(), '.serverless'),
    debug: options.debug,
    stage: options.stage || 'dev',
    entity: serverlessFile.name, // either the name prop of the yaml, or class name of js
  };

  const context = new Context(config);

  try {
    const componentsService = new ComponentsService(context, serverlessFile);
    await componentsService.init();

    if (componentName) {
      await componentsService.invokeComponentCommand(componentName, method, options);
    } else {
      if (typeof componentsService[method] !== 'function') {
        throw new Error(`Command ${method} not found`);
      }
      await componentsService[method](options);
    }

    componentsService.shutdown();
    process.exit(0);
  } catch (e) {
    context.renderError(e);
    process.exit(1);
  }
};

module.exports = {
  runComponents,
  Component,
  Context,
};
