const crypto = require('crypto');
const { App } = require('aws-cdk-lib');
const { Bootstrapper } = require('aws-cdk/lib/api/bootstrap');
const { SdkProvider } = require('aws-cdk/lib/api/aws-auth/sdk-provider');
const { CloudFormationDeployments } = require('aws-cdk/lib/api/cloudformation-deployments');
const { CloudFormationClient, DescribeStacksCommand } = require('@aws-sdk/client-cloudformation');
const { sdkConfig } = require('./sdk-config');

// Silence CDK output
const logging = require('aws-cdk/lib/logging');
// @ts-ignore
logging.print = function () {};
// @ts-ignore
logging.data = function () {};
// @ts-ignore
logging.warning = function () {};

class Cdk {
  toolkitStackName = 'serverless-cdk-toolkit';

  /**
   * @param {(string) => void} logVerbose
   * @param {Record<string, any>} state
   * @param {string} stackName
   * @param {string} [region]
   */
  constructor(logVerbose, state, stackName, region) {
    this.logVerbose = logVerbose;
    this.state = state;
    this.stackName = stackName;
    this.region = region;
  }

  /**
   * @param {App} app
   * @return {Promise<boolean>} Whether changes were deployed.
   */
  async deploy(app) {
    this.logVerbose('Deploying the CloudFormation stack');

    // @see https://github.com/aws/aws-cdk/blob/fa16f7a9c11981da75e44ffc83adcdc6edad94fc/packages/aws-cdk/lib/cli.ts#L257-L264
    const sdkProvider = await SdkProvider.withAwsCliCompatibleDefaults();
    const accountId = (await sdkProvider.defaultAccount())?.accountId;
    if (accountId === undefined) {
      throw new Error('No AWS account ID could be found via the AWS credentials');
    }

    await this.bootstrapCdk(sdkProvider, accountId);

    this.logVerbose(`Deploying ${this.stackName}`);
    const stackArtifact = app.synth().getStackByName(this.stackName);
    const cloudFormationTemplateHash = crypto
      .createHash('md5')
      .update(JSON.stringify(stackArtifact.template))
      .digest('hex');

    if (this.state.cloudFormationTemplateHash === cloudFormationTemplateHash) {
      this.logVerbose('Nothing to deploy, the stack is up to date');
      return false;
    }

    const cloudFormation = new CloudFormationDeployments({ sdkProvider });
    const deployResult = await cloudFormation.deployStack({
      stack: stackArtifact,
      toolkitStackName: 'serverless-cdk-toolkit',
    });

    this.state.cloudFormationTemplateHash = cloudFormationTemplateHash;

    if (deployResult.noOp) {
      this.logVerbose('Nothing to deploy, the stack is up to date');
      return false;
    }
    this.logVerbose('Deployment success');
    return true;
  }

  /**
   * @private
   */
  async bootstrapCdk(sdkProvider, accountId) {
    if (this.state.cdkBootstrapped) {
      this.logVerbose('The CDK is already set up, moving on');
      return;
    }

    // Setup the bootstrap stack
    // Ideally we don't do that every time
    this.logVerbose('Setting up the CDK');
    const cdkBootstrapper = new Bootstrapper({
      source: 'default',
    });
    const bootstrapDeployResult = await cdkBootstrapper.bootstrapEnvironment(
      {
        account: accountId,
        name: 'dev',
        region: 'us-east-1',
      },
      sdkProvider,
      {
        /**
         * We use a CDK toolkit stack dedicated to Serverless.
         * The reason for this is:
         * - to keep complete control over that stack
         * - because there are multiple versions, we don't want to force
         * one specific version on users
         * (see https://docs.aws.amazon.com/cdk/latest/guide/bootstrapping.html#bootstrapping-templates)
         */
        toolkitStackName: this.toolkitStackName,
        /**
         * In the same spirit as the custom stack name, we must provide
         * a different "qualifier": this ID will be used in CloudFormation
         * exports to provide a unique export name.
         */
        parameters: {
          qualifier: 'serverless',
        },
      }
    );
    if (bootstrapDeployResult.noOp) {
      this.logVerbose('The CDK is already set up, moving on');
    }
    this.state.cdkBootstrapped = true;
  }

  /**
   * @return {Promise<Record<string, any>>}
   */
  async getStackOutputs() {
    this.logVerbose(`Fetching outputs of stack "${this.stackName}"`);

    const cloudFormation = new CloudFormationClient(await sdkConfig());
    let data;
    try {
      data = await cloudFormation.send(
        new DescribeStacksCommand({
          StackName: this.stackName,
        })
      );
    } catch (e) {
      if (e instanceof Error && e.message === `Stack with id ${this.stackName} does not exist`) {
        this.logVerbose(e.message);
        return {};
      }
      throw e;
    }
    if (!data?.Stacks?.[0]?.Outputs) return {};

    const outputs = {};
    for (const item of data.Stacks[0].Outputs) {
      const id = this.lowercaseFirstLetter(item.OutputKey);
      outputs[id] = item.OutputValue;
    }
    return outputs;
  }

  lowercaseFirstLetter(string) {
    return string.charAt(0).toLowerCase() + string.slice(1);
  }
}

module.exports = Cdk;
