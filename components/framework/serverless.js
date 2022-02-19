const Component = require('../../src/Component');
const child_process = require('child_process');
const YAML = require('js-yaml');

class ServerlessFramework extends Component {
  constructor(id, context, inputs) {
    // Default inputs
    inputs.path = inputs.path ?? '.';

    super(id, context, inputs);
  }

  // TODO:
  // Component-specific commands
  // In the long run, they should be generated based on configured command schema
  // and options schema for each command
  // commands = {
  //   print: {
  //     handler: async () => await this.command(['print']),
  //   },
  //   package: {
  //     handler: async () => await this.command(['package']),
  //   },
  // };
  // For now the workaround is to just pray that the command is correct and rely on validation from the Framework
  async command(command, options) {
    const cliparams = Object.entries(options).map(([key, value]) => `--${key}=${value}`);
    const args = [command, ...cliparams];
    return await this.exec('serverless', args, true);
  }

  async deploy() {
    const { stderr: deployOutput } = await this.exec('serverless', ['deploy']);
    // if (deployOutput.includes('No changes to deploy. Deployment skipped.')) {
    //   return;
    // }
    await this.updateOutputs(await this.retrieveOutputs());
  }

  async remove() {
    await this.exec('serverless', ['remove']);
    this.state = {};
    await this.save();
    await this.updateOutputs({});
  }

  async logs() {
    const promises = Object.keys(this.outputs.functions).map(async (functionName) => {
      try {
        await this.exec('serverless', ['logs', '--function', functionName], true);
      } catch (e) {
        // TODO implement warning?
        this.logVerbose(`Error fetching logs for function ${this.id}:${functionName}`);
      }
    });
    await Promise.all(promises);
  }

  async dev() {
    Object.keys(this.outputs.functions).forEach((functionName) => {
      this.exec('serverless', ['logs', '--tail', '--function', functionName], true);
    });

    return this.context.watch(this.inputs.path, async () => {
      this.context.status('Uploading');
      const promises = Object.keys(this.outputs.functions).map(async (functionName) => {
        await this.exec('serverless', ['deploy', 'function', '--function', functionName]);
      });
      await Promise.all(promises);
    });
  }

  /**
   * @return {Promise<string>}
   */
  async exec(command, args, streamStdout = false) {
    // Add stage
    args.push('--stage', this.context.stage);
    // Add config file name if necessary
    if (this.inputs?.config) {
      args.push('--config', this.inputs.config);
    }
    // Add inputs
    for (const [key, value] of Object.entries(this.inputs?.parameters ?? {})) {
      args.push('--param', `${key}=${value}`);
    }

    this.logVerbose(`Running "${command} ${args.join(' ')}"`);
    return new Promise((resolve, reject) => {
      const process = child_process.spawn(command, args, {
        cwd: this.inputs.path,
        stdio: streamStdout ? 'inherit' : undefined,
      });
      let stdout = '';
      let stderr = '';
      let allOutput = '';
      if (process.stdout) {
        process.stdout.on('data', (data) => {
          this.logVerbose(data.toString().trim());
          stdout += data;
          allOutput += data;
        });
      }
      if (process.stderr) {
        process.stderr.on('data', (data) => {
          this.logVerbose(data.toString().trim());
          stderr += data;
          allOutput += data;
        });
      }
      process.on('error', (err) => reject(err));
      process.on('close', (code) => {
        if (code !== 0) {
          // Try to extract the error message (temporary solution)
          const errorMessagePosition = allOutput.indexOf('Error:');
          const error =
            errorMessagePosition >= 0 ? allOutput.slice(errorMessagePosition) : allOutput;
          reject(error);
        }
        resolve({ stdout, stderr });
      });
    });
  }

  async retrieveOutputs() {
    const { stdout: infoOutput } = await this.exec('serverless', ['info', '--verbose']);
    let outputs;
    try {
      outputs = YAML.load(infoOutput.toString());
    } catch (e) {
      throw new Error(`Impossible to parse the output of "serverless info":\n${infoOutput}`);
    }

    // Exclude some useless fields from the outputs
    delete outputs['service']; // this duplicates the component ID
    delete outputs['stage']; // stage is global across all components anyway
    delete outputs['stack']; // stage is global across all components anyway
    delete outputs['endpoints']; // TODO present them better
    // Merge CF outputs into the list
    outputs = {
      ...outputs,
      ...outputs['Stack Outputs'],
    };
    delete outputs['Stack Outputs'];
    delete outputs['ServerlessDeploymentBucketName']; // useless info

    return outputs;
  }
}

module.exports = ServerlessFramework;
