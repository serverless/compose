const fsp = require('fs').promises;
const path = require('path');
const YAML = require('js-yaml');

const getComponentsConfig = async (serverlessFilePath) => {
  // TODO: Add support for different formats, for now assume yml extension
  // TODO: Add better error handling
  try {
    const contents = await fsp.readFile(serverlessFilePath);
    return YAML.load(contents.toString(), { filename: serverlessFilePath });
  } catch (e) {
    // TODO: Better error handling
  }
};

const run = async () => {
  // TODO: Support provided config path
  const serverlessFilePath = getComponentsConfig(path.join(process.cwd(), 'serverless.yml'));

  // TODO: Resolve command that should be run

  // TODO: Initialize state for components from file (or different backend in the future)

  // TODO: Invoke command of a single component or invoke command for all components

  // TODO: Resolve static variables in a template (initial variable resolution) - maybe we could reuse new parser from the Framework?

  // TODO: Gather all components from configuration

  // TODO: Download components from npm (not for the first iteration)

  // TODO: Analyse dependencies between components

  // TODO: Create components graph, based on dependencies between them, validate if it does not have cyclical dependencies

  // TODO: Execute components in graph or in parallel, based on the command type
};
