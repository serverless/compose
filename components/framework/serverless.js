const Component = require("../../src/Component");
const child_process = require("child_process");
const yaml = require("yaml");

class ServerlessFramework extends Component {
  async deploy() {
    const { stderr: deployOutput } = await this.exec("serverless", ["deploy"]);
    if (deployOutput.includes("No changes to deploy. Deployment skipped.")) {
      return;
    }

    const { stdout: infoOutput } = await this.exec("serverless", ["info"]);
    let outputs;
    try {
      outputs = yaml.parse(infoOutput);
    } catch (e) {
      throw new Error(
        `Impossible to parse the output of "serverless info":\n${infoOutput}`
      );
    }
    await this.updateOutputs(outputs);
  }

  async remove() {
    await this.exec("serverless", ["remove"]);
    this.state = {};
    await this.save();
    await this.updateOutputs({});
  }

  async logs() {
    const promises = Object.keys(this.outputs.functions).map(
      async (functionName) => {
        try {
          await this.exec(
            "serverless",
            ["logs", "--function", functionName],
            true
          );
        } catch (e) {
          // TODO implement warning?
                this.logVerbose(
            `Error fetching logs for function ${this.id}:${functionName}`
          );
        }
      }
    );
    await Promise.all(promises);
  }

  async dev() {
    Object.keys(this.outputs.functions).forEach((functionName) => {
      this.exec(
        "serverless",
        ["logs", "--tail", "--function", functionName],
        true
      );
    });

    return this.context.watch(this.inputs.path, async () => {
      this.context.status("Uploading");
      const promises = Object.keys(this.outputs.functions).map(
        async (functionName) => {
          await this.exec("serverless", [
            "deploy",
            "function",
            "--function",
            functionName,
          ]);
        }
      );
      await Promise.all(promises);
    });
  }

  /**
   * @return {Promise<string>}
   */
  async exec(command, args, streamStdout = false) {
    // Add stage
    args.push("--stage", this.context.stage);
    // Add inputs
    for (const [key, value] of Object.entries(this.inputs?.parameters ?? {})) {
      args.push("--param", `${key}=${value}`);
    }

    this.logVerbose(`Running "${command} ${args.join(" ")}"`);
    return new Promise((resolve, reject) => {
      const process = child_process.spawn(command, args, {
        cwd: this.inputs.path,
        stdio: streamStdout ? "inherit" : undefined,
      });
      let stdout = "";
      let stderr = "";
      let allOutput = "";
      if (process.stdout) {
        process.stdout.on("data", (data) => {
          this.logVerbose(data.toString().trim());
          stdout += data;
          allOutput += data;
        });
      }
      if (process.stderr) {
        process.stderr.on("data", (data) => {
          this.logVerbose(data.toString().trim());
          stderr += data;
          allOutput += data;
        });
      }
      process.on("error", (err) => reject(err));
      process.on("close", (code) => {
        if (code !== 0) {
                    // Try to extract the error message (temporary solution)
                    const errorMessagePosition = allOutput.indexOf('Error:');
                    const error = errorMessagePosition >= 0 ? allOutput.slice(errorMessagePosition) : allOutput;
                    reject(error);
        }
        resolve({ stdout, stderr });
      });
    });
  }
}

module.exports = ServerlessFramework;
