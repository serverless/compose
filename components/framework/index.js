'use strict';

const spawn = require('cross-spawn');
const YAML = require('js-yaml');
const hasha = require('hasha');
const globby = require('globby');
const path = require('path');
const spawnExt = require('child-process-ext/spawn');
const semver = require('semver');
const { configSchema } = require('./configuration');
const ServerlessError = require('../../src/serverless-error');

const MINIMAL_FRAMEWORK_VERSION = '3.7.7';

const doesSatisfyRequiredFrameworkVersion = (version) =>
  semver.gte(version, MINIMAL_FRAMEWORK_VERSION);

class ServerlessFramework {
  /**
   * @param {string} id
   * @param {import('../../src/ComponentContext')} context
   * @param {Record<string, any>} inputs
   */
  constructor(id, context, inputs) {
    this.id = id;
    this.inputs = inputs;
    this.context = context;

    if (path.relative(process.cwd(), inputs.path) === '') {
      throw new ServerlessError(
        `Service "${id}" cannot have a "path" that points to the root directory of the Serverless Framework Compose project`,
        'INVALID_PATH_IN_SERVICE_CONFIGURATION'
      );
    }
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
    const cliparams = Object.entries(options)
      .filter(([key]) => key !== 'stage')
      .flatMap(([key, value]) => {
        if (value === true) {
          // Support flags like `--verbose`
          return `--${key}`;
        }
        if (key.length === 1) {
          // To handle shorthand notation like
          // deploy -f function
          return [`-${key}`, value];
        }
        return `--${key}=${value}`;
      });
    const args = [...command.split(':'), ...cliparams];
    return await this.exec('serverless', args, true);
  }

  async deploy() {
    this.context.startProgress('deploying');

    let cacheHash;
    if (this.inputs.cachePatterns) {
      this.context.updateProgress('calculating changes');
      cacheHash = await this.calculateCacheHash();
      const hasNoChanges =
        JSON.stringify(this.inputs) === JSON.stringify(this.context.state.inputs) &&
        cacheHash === this.context.state.cacheHash;
      if (hasNoChanges) {
        this.context.successProgress('no changes');
        return;
      }
      this.context.updateProgress('deploying');
    }

    const { stderr: deployOutput } = await this.exec('serverless', ['deploy']);

    const hasOutputs = this.context.outputs && Object.keys(this.context.outputs).length > 0;
    const hasChanges = !deployOutput.includes('No changes to deploy. Deployment skipped.');
    // Skip retrieving outputs via `sls info` if we already have outputs (faster)
    if (hasChanges || !hasOutputs) {
      await this.context.updateOutputs(await this.retrieveOutputs());
    }

    // Save state
    if (this.inputs.cachePatterns) {
      this.context.state.inputs = this.inputs;
      this.context.state.cacheHash = cacheHash;
      await this.context.save();
    }

    if (hasChanges) {
      this.context.successProgress('deployed');
    } else {
      this.context.successProgress('no changes');
    }
  }

  async remove() {
    this.context.startProgress('removing');

    await this.exec('serverless', ['remove']);
    this.context.state = {};
    await this.context.save();
    await this.context.updateOutputs({});
    this.context.successProgress('removed');
  }

  async package() {
    this.context.startProgress('packaging');

    await this.exec('serverless', ['package']);

    this.context.successProgress('packaged');
  }

  async info() {
    const { stdout: infoOutput } = await this.exec('serverless', ['info']);
    this.context.writeText(infoOutput);
  }

  async retrieveFunctions() {
    const { stdout: printOutput } = await this.exec('serverless', ['print']);
    try {
      return YAML.load(printOutput.toString()).functions || {};
    } catch {
      throw new Error(`Could not retrieve functions from configuration:\n${printOutput}`);
    }
  }

  async logs(options) {
    const functions = await this.retrieveFunctions();
    // Some services do not have functions, let's not start a progress when tailing
    if (Object.keys(functions).length === 0) return;

    if (options.tail) {
      this.context.startProgress('logs');
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
            this.context.writeText(output.trim(), [functionName]);
          }
        });
      } catch (e) {
        // Silence this error because it's not really an error: there are simply no logs
        if (typeof e === 'string' && e.includes('No existing streams for the function')) return;
        this.context.logError(e, [functionName]);
      }
    });
    await Promise.all(promises);

    if (options.tail) {
      this.context.successProgress('no log streams to tail');
    }
  }

  async refreshOutputs() {
    this.context.startProgress('refreshing outputs');
    await this.context.updateOutputs(await this.retrieveOutputs());
    this.context.successProgress('outputs refreshed');
  }

  async ensureFrameworkVersion() {
    if (
      !this.context.state.detectedFrameworkVersion ||
      !doesSatisfyRequiredFrameworkVersion(this.context.state.detectedFrameworkVersion)
    ) {
      let stdoutResult;
      try {
        const { stdoutBuffer } = await spawnExt('serverless', ['--version']);
        stdoutResult = stdoutBuffer.toString();
      } catch (e) {
        throw new Error(
          'Could not find the Serverless Framework CLI installation. Ensure Serverless Framework is installed before continuing.\nhttps://serverless.com/framework/docs/getting-started'
        );
      }
      const matchResult = stdoutResult.match(/Framework Core: ([0-9]+\.[0-9]+\.[0-9]+)/);
      if (matchResult) {
        const version = matchResult[1];
        if (doesSatisfyRequiredFrameworkVersion(version)) {
          // Stored to avoid checking it on each invocation
          // We ignore edge case when someone downgrades or uninstalls serverless afterwards
          this.context.state.detectedFrameworkVersion = version;
          this.context.save();
        } else {
          throw new Error(
            `The installed version of Serverless Framework (${version}) is not supported by Compose. Please upgrade Serverless Framework to a version greater or equal to "${MINIMAL_FRAMEWORK_VERSION}"`
          );
        }
      } else {
        throw new Error(
          'Could not verify the Serverless Framework CLI installation. Ensure Serverless Framework is installed before continuing.\nhttps://serverless.com/framework/docs/getting-started'
        );
      }
    }
  }

  /**
   * @return {Promise<{ stdout: string, stderr: string }>}
   */
  async exec(command, args, streamStdout = false, stdoutCallback = undefined) {
    await this.ensureFrameworkVersion();
    // Add stage
    args.push('--stage', this.context.stage);
    // Add config file name if necessary
    if (this.inputs && this.inputs.config) {
      args.push('--config', this.inputs.config);
    }
    // Add inputs
    for (const [key, value] of Object.entries((this.inputs && this.inputs.params) || {})) {
      args.push('--param', `${key}=${value}`);
    }

    // Add region if necessary
    if (this.inputs && this.inputs.region) {
      args.push('--region', this.inputs.region);
    }

    // Patch required for standalone distribution of Serverless
    // Needed because of the behavior of `pkg` when invoking itself via subprocess
    // https://github.com/vercel/pkg/issues/897
    if (command === 'serverless' && process.pkg) {
      args = [process.pkg.entrypoint, ...args];
    }

    this.context.logVerbose(`Running "${command} ${args.join(' ')}"`);
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: this.inputs.path,
        stdio: streamStdout ? 'inherit' : undefined,
        env: { ...process.env, SLS_DISABLE_AUTO_UPDATE: '1', SLS_COMPOSE: '1' },
      });

      // Make sure that when our process is killed, we terminate the subprocess too
      const processExitCallback = () => {
        child.kill();
      };
      process.on('exit', processExitCallback);

      let stdout = '';
      let stderr = '';
      let allOutput = '';
      if (child.stdout) {
        child.stdout.on('data', (data) => {
          this.context.logVerbose(data.toString().trim());
          stdout += data;
          allOutput += data;
          if (stdoutCallback) {
            stdoutCallback(data.toString());
          }
        });
      }
      if (child.stderr) {
        child.stderr.on('data', (data) => {
          this.context.logVerbose(data.toString().trim());
          stderr += data;
          allOutput += data;
        });
      }
      child.on('error', (err) => {
        process.removeListener('exit', processExitCallback);
        reject(err);
      });
      child.on('close', (code) => {
        process.removeListener('exit', processExitCallback);
        if (code !== 0) {
          // Try to extract the error message (temporary solution)
          const errorMessagePosition = stdout.indexOf('Error:');
          const error = errorMessagePosition >= 0 ? stdout.slice(errorMessagePosition) : allOutput;
          reject(error);
        }
        resolve({ stdout, stderr });
      });
    });
  }

  async retrieveOutputs() {
    const { stdout: infoOutput } = await this.exec('serverless', ['info', '--verbose']);
    try {
      return YAML.load(infoOutput.toString())['Stack Outputs'];
    } catch (e) {
      if (infoOutput.toString()) {
        // Try to extract the section with `Stack Outputs` and parse it
        // The regex below matches everything indented with 2 spaces below "Stack Outputs:"
        // If plugins add extra output afterwards, it should be ignored.
        const res = infoOutput.toString().match(/Stack Outputs:\n(( {2}[ \S]+\n)+)/);
        if (res) {
          try {
            return YAML.load(res[1]);
          } catch {
            // Pass to generic error
          }
        }
      }
    }
    throw new Error(`Impossible to parse the output of "serverless info":\n${infoOutput}`);
  }

  /**
   * @return {Promise<string>}
   */
  async calculateCacheHash() {
    const algorithm = 'md5'; // fastest

    const allFilePaths = await globby(this.inputs.cachePatterns, {
      cwd: this.inputs.path,
    });

    const promises = [];
    for (const filePath of allFilePaths) {
      promises.push(hasha.fromFile(path.join(this.inputs.path, filePath), { algorithm }));
    }
    const hashes = await Promise.all(promises);

    // Sort hashes to avoid having the final hash change just because files where read in a different order
    hashes.sort();

    return hasha(hashes.join(), { algorithm });
  }
}

ServerlessFramework.SCHEMA = configSchema;

module.exports = ServerlessFramework;
