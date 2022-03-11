'use strict';

const Component = require('../../src/Component');
const childProcess = require('child_process');
const YAML = require('js-yaml');
const { execSync } = require('child_process');

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
    const cliparams = Object.entries(options).map(([key, value]) => {
      if (value === true) {
        // Support flags like `--verbose`
        return `--${key}`;
      }
      return `--${key}=${value}`;
    });
    const args = [...command.split(':'), ...cliparams];
    return await this.exec('serverless', args, true);
  }

  async deploy() {
    this.startProgress('deploying');

    let currentGitRef;
    if (this.inputs.gitDiff) {
      this.updateProgress('calculating changes');
      // TODO optimize by returning early
      const hasInputChanges = JSON.stringify(this.inputs) !== JSON.stringify(this.state.inputs);
      currentGitRef = this.getCurrentGitRef();
      const isTrackedByGit = !!currentGitRef;
      const hasGitChanges = !this.state.deployedGitRef || this.hasChangesSinceCommit(this.state.deployedGitRef);
      const hasChanges = hasInputChanges || !isTrackedByGit || hasGitChanges;
      if (hasChanges) {
        this.logVerbose('Changes detected, deploying');
        this.updateProgress('deploying');
      } else {
        this.successProgress('no changes');
        return;
      }
    }

    const { stderr: deployOutput } = await this.exec('serverless', ['deploy']);

    const hasOutputs = this.outputs && Object.keys(this.outputs).length > 0;
    const hasChanges = !deployOutput.includes('No changes to deploy. Deployment skipped.');
    // Skip retrieving outputs via `sls info` if we already have outputs (faster)
    if (hasChanges || !hasOutputs) {
      await this.updateOutputs(await this.retrieveOutputs());
    }

    // Save state
    if (this.inputs.gitDiff) {
      this.state.inputs = this.inputs;
      // TODO handle the case where local changes have been deployed
      this.state.deployedGitRef = currentGitRef;
      await this.save();
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
    for (const [key, value] of Object.entries(this.inputs?.params ?? {})) {
      args.push('--param', `${key}=${value}`);
    }

    this.logVerbose(`Running "${command} ${args.join(' ')}"`);
    return new Promise((resolve, reject) => {
      const child = childProcess.spawn(command, args, {
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
          const errorMessagePosition = stdout.indexOf('Error:');
          const error = errorMessagePosition >= 0 ? stdout.slice(errorMessagePosition) : allOutput;
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
    delete outputs.service; // this duplicates the component ID
    delete outputs.stage; // stage is global across all components anyway
    delete outputs.stack; // stage is global across all components anyway
    delete outputs.endpoints; // TODO present them better
    // Merge CF outputs into the list
    outputs = {
      ...outputs,
      ...outputs['Stack Outputs'],
    };
    delete outputs['Stack Outputs'];
    delete outputs.ServerlessDeploymentBucketName; // useless info

    return outputs;
  }

  /**
   * @return {string}
   */
  getCurrentGitRef() {
    return execSync('git rev-parse HEAD', {
      cwd: this.inputs.path,
    }).toString().trim();
  }

  /**
   * @return {boolean}
   */
  hasChangesSinceCommit(previousGitRef) {
    const gitDiff = execSync(`git diff --name-only "${previousGitRef}" .`, {
      cwd: this.inputs.path,
    }).toString().trim();
    if (gitDiff.length > 0) {
      return true;
    }

    // We also consider untracked changes
    const untrackedFiles = execSync('git status --porcelain .', {
      cwd: this.inputs.path,
    }).toString().trim();
    return untrackedFiles.length > 0;
  }
}

module.exports = ServerlessFramework;
