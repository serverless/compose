'use strict';

// Setup log writing
require('@serverless/utils/log-reporters/node');

const path = require('path');
const args = require('minimist')(process.argv.slice(2));
const utils = require('./utils');
const renderHelp = require('./render-help');
const Context = require('./Context');
const Component = require('./Component');
const ComponentsService = require('./ComponentsService');

// Simplified support only for yml
const getServerlessFile = (dir) => {
  const ymlFilePath = path.join(dir, 'serverless-compose.yml');
  const yamlFilePath = path.join(dir, 'serverless-compose.yaml');

  if (utils.fileExistsSync(ymlFilePath)) {
    return utils.readFileSync(ymlFilePath);
  }
  if (utils.fileExistsSync(yamlFilePath)) {
    return utils.readFileSync(yamlFilePath);
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

  // make sure it IS a serverless-compose file
  if (serverlessFile.services) {
    return true;
  }

  return false;
};

const runComponents = async () => {
  if (args.help || args._[0] === 'help') {
    await renderHelp();
    return;
  }

  let method = args._[0];
  if (!method) {
    await renderHelp();
    return;
  }

  const serverlessFile = getServerlessFile(process.cwd());

  if (!serverlessFile) {
    throw new Error('No serverless-compose.yml file found.');
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
    throw new Error('serverless-compose.yml file does not contain valid serverless-compose configuration');
  }

  const config = {
    root: process.cwd(),
    stateRoot: path.join(process.cwd(), '.serverless'),
    verbose: options.verbose,
    stage: options.stage || 'dev',
    appName: serverlessFile.name,
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

    context.shutdown();
    process.exit(0);
  } catch (e) {
    context.logger.error(e);
    process.exit(1);
  }
};

module.exports = {
  runComponents,
  Component,
  Context,
};
