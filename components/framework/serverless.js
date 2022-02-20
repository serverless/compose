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
    this.startProgress('deploying');

    const { stderr: deployOutput } = await this.exec('serverless', ['deploy']);

    const hasOutputs = this.outputs && Object.keys(this.outputs).length > 0;
    const hasChanges = !deployOutput.includes('No changes to deploy. Deployment skipped.');
    // Skip retrieving outputs via `sls info` if we already have outputs (faster)
    if (hasChanges || !hasOutputs) {
      await this.updateOutputs(await this.retrieveOutputs());
    }

    if (hasChanges) {
      this.successProgress('deployed');
    } else {
      this.successProgress('no changes');
    }
  }

  async remove() {
    this.startProgress('removing');

    await this.exec('serverless', ['remove']);
    this.state = {};
    await this.save();
    await this.updateOutputs({});

    this.successProgress('removed');
  }

  async logs(options) {
    const functions = this.outputs.functions ?? {};
    // Some services do not have functions, let's not start a progress when tailing
    if (Object.keys(functions).length === 0) return;

    if (options.tail) {
      this.startProgress('logs');
    }

    const promises = Object.keys(functions).map(async (functionName) => {
      const args = ['logs', '--function', functionName];
      if (options.tail) {
        args.push('--tail');
      }
      try {
        await this.exec('serverless', args, false, (output) => {
          if (output.length > 0) {
            // Silence this error because it's not really an error: there are simply no logs
            if (output.includes('No existing streams for the function')) return;
            this.writeText(output.trim(), [functionName]);
          }
        });
      } catch (e) {
        // Silence this error because it's not really an error: there are simply no logs
        if (typeof e === 'string' && e.includes('No existing streams for the function')) return;
        this.logError(e, [functionName]);
      }
    });
    await Promise.all(promises);

    if (options.tail) {
      this.successProgress('no log streams to tail');
    }
  }

  /**
   * @return {Promise<{ stdout: string, stderr: string }>}
   */
  async exec(command, args, streamStdout = false, stdoutCallback = undefined) {
    // Add stage
    args.push('--stage', this.stage);
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
      const child = child_process.spawn(command, args, {
        cwd: this.inputs.path,
        stdio: streamStdout ? 'inherit' : undefined,
      });
      let stdout = '';
      let stderr = '';
      let allOutput = '';
      if (child.stdout) {
        child.stdout.on('data', (data) => {
          this.logVerbose(data.toString().trim());
          stdout += data;
          allOutput += data;
          if (stdoutCallback) {
            stdoutCallback(data.toString());
          }
        });
      }
      if (child.stderr) {
        child.stderr.on('data', (data) => {
          this.logVerbose(data.toString().trim());
          stderr += data;
          allOutput += data;
        });
      }
      child.on('error', (err) => reject(err));
      child.on('close', (code) => {
        if (code !== 0) {
          // Try to extract the error message (temporary solution)
          const errorMessagePosition = allOutput.indexOf('Error:');
          const error =
            errorMessagePosition >= 0 ? allOutput.slice(errorMessagePosition) : allOutput;
          reject(error);
        }
        resolve({ stdout, stderr });
      });
      // Make sure that when our process is killed, we terminate the subprocess too
      process.on('exit', () => child.kill());
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
