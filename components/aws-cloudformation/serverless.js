'use strict';

const fs = require('fs-extra');
const crypto = require('crypto');
const Component = require('../../src/Component');
const {
  CloudFormationClient,
  DescribeStacksCommand,
  CreateChangeSetCommand,
  waitUntilChangeSetCreateComplete,
  DescribeChangeSetCommand,
  ExecuteChangeSetCommand,
  waitUntilStackCreateComplete,
  waitUntilStackUpdateComplete,
  DeleteStackCommand,
  waitUntilStackDeleteComplete,
  DeleteChangeSetCommand,
} = require('@aws-sdk/client-cloudformation');

/**
 * EXPERIMENTAL
 *
 * This is a POC and undocumented, DO NOT USE :)
 *
 * If you stumble upon this, and if you are reaaaally interested in that feature,
 * please open an issue and get the discussion started.
 *
 * This component mostly exists to validate our component API and do demoes.
 */
class AwsCloudformation extends Component {
  /** @type {string|undefined} */
  region;

  constructor(id, context, inputs) {
    super(id, context, inputs);

    this.stackName = `${this.appName}-${this.id}-${this.stage}`;
    this.region = this.inputs.region;
  }

  async deploy() {
    this.startProgress('deploying');

    const file = this.inputs.template;
    const template = fs.readFileSync(file, 'utf8');

    const templateHash = crypto.createHash('md5').update(template).digest('hex');
    if (templateHash === this.state.templateHash) {
      this.successProgress('no changes');
      return;
    }

    this.startProgress('creating changeset');

    const cloudFormation = this.createClient();
    const changeSetName = `${this.stackName}-${Date.now()}`;

    const operation = await this.deployOperation(cloudFormation, this.stackName);

    this.logVerbose(
      `Creating CloudFormation changeset of type ${operation} for stack ${this.stackName}`
    );
    await cloudFormation.send(
      new CreateChangeSetCommand({
        StackName: this.stackName,
        ChangeSetName: changeSetName,
        ChangeSetType: operation,
        Capabilities: [],
        Parameters: [],
        TemplateBody: template,
      })
    );

    try {
      await waitUntilChangeSetCreateComplete(
        {
          client: cloudFormation,
          maxWaitTime: 15 * 60, // 15 minutes
        },
        {
          StackName: this.stackName,
          ChangeSetName: changeSetName,
        }
      );
    } catch (e) {
      const changeSet = await cloudFormation.send(
        new DescribeChangeSetCommand({
          StackName: this.stackName,
          ChangeSetName: changeSetName,
        })
      );
      if (changeSet.Status === 'FAILED') {
        if (
          changeSet.StatusReason &&
          changeSet.StatusReason.includes("The submitted information didn't contain changes.")
        ) {
          this.logVerbose('No changes, deleting changeset');
          await cloudFormation.send(
            new DeleteChangeSetCommand({
              StackName: this.stackName,
              ChangeSetName: changeSetName,
            })
          );
          // Supports scenarios where the stack was deployed separately and we don't have it tracked
          const hasOutputs = this.outputs && Object.keys(this.outputs).length > 0;
          if (!hasOutputs) {
            await this.refreshOutputs(cloudFormation);
          }
          // Update state
          this.state.templateHash = templateHash;
          await this.save();
          this.successProgress('no changes');
          return;
        }
        throw new Error(
          `failed creating the CloudFormation changeset containing the changes to deploy. ${changeSet.StatusReason}`
        );
      }

      throw e;
    }

    const changeSet = await cloudFormation.send(
      new DescribeChangeSetCommand({
        StackName: this.stackName,
        ChangeSetName: changeSetName,
      })
    );
    if (changeSet.Status === 'FAILED') {
      throw new Error(
        `Failed creating the change set containing the changes to deploy. ${changeSet.StatusReason}`
      );
    }

    this.updateProgress('applying changeset');

    this.logVerbose('Applying CloudFormation changeset');
    await cloudFormation.send(
      new ExecuteChangeSetCommand({
        StackName: this.stackName,
        ChangeSetName: changeSetName,
      })
    );

    try {
      if (operation === 'CREATE') {
        await waitUntilStackCreateComplete(
          {
            client: cloudFormation,
            maxWaitTime: 20 * 60, // 20 minutes
          },
          {
            StackName: this.stackName,
          }
        );
      } else {
        await waitUntilStackUpdateComplete(
          {
            client: cloudFormation,
            maxWaitTime: 20 * 60, // 20 minutes
          },
          {
            StackName: this.stackName,
          }
        );
      }
    } catch (e) {
      const response = await cloudFormation.send(
        new DescribeStacksCommand({
          StackName: this.stackName,
        })
      );
      const stackStatus = response.Stacks[0].StackStatus;
      const reason = response.Stacks[0].StackStatusReason
        ? response.Stacks[0].StackStatusReason
        : stackStatus;
      throw new Error(reason);
    }

    const response = await cloudFormation.send(
      new DescribeStacksCommand({
        StackName: this.stackName,
      })
    );
    const stackStatus = response.Stacks ? response.Stacks[0].StackStatus : undefined;
    if (stackStatus === 'CREATE_FAILED' || stackStatus === 'ROLLBACK_COMPLETE') {
      throw new Error(
        response.Stacks[0].StackStatusReason ? response.Stacks[0].StackStatusReason : stackStatus
      );
    }

    // Save state
    this.state.templateHash = templateHash;
    await this.save();

    await this.refreshOutputs(cloudFormation, response);

    this.successProgress('deployed');
  }

  async remove() {
    this.startProgress('removing');

    const cloudFormation = this.createClient();

    const response = await cloudFormation.send(
      new DescribeStacksCommand({
        StackName: this.stackName,
      })
    );
    if (!response.Stacks || response.Stacks?.length === 0) {
      this.successProgress('no stack to remove');
      return;
    }
    // Use the stack ID because it keeps working even after the stack is deleted
    const stackId = response.Stacks[0].StackId;

    await cloudFormation.send(
      new DeleteStackCommand({
        StackName: this.stackName,
      })
    );

    await waitUntilStackDeleteComplete(
      {
        client: cloudFormation,
        maxWaitTime: 20 * 60, //
      },
      {
        StackName: stackId,
      }
    );

    this.state = {};
    await this.save();
    await this.updateOutputs({});

    this.successProgress('removed');
  }

  /**
   * @param {CloudFormationClient} cloudFormation
   * @param {string} stackName
   * @return {Promise<'CREATE'|'UPDATE'>}
   */
  async deployOperation(cloudFormation, stackName) {
    let response;
    try {
      response = await cloudFormation.send(
        new DescribeStacksCommand({
          StackName: stackName,
        })
      );
    } catch (e) {
      // Not found
      return 'CREATE';
    }
    if (response.Stacks && response.Stacks[0].StackStatus === 'ROLLBACK_COMPLETE') {
      throw new Error(
        'The stack is in a failed state because its creation failed. You need to delete it first and redeploy.'
      );
    }
    if (response.Stacks && response.Stacks[0].StackStatus === 'REVIEW_IN_PROGRESS') {
      return 'CREATE';
    }

    return 'UPDATE';
  }

  /**
   * @return {CloudFormationClient}
   */
  createClient() {
    const options = {};
    if (this.region) {
      options.region = this.region;
    }
    // TODO we need a way to configure AWS credentials
    return new CloudFormationClient(options);
  }

  /**
   * Refresh outputs from CloudFormation outputs.
   *
   * @param {CloudFormationClient} cloudFormation
   * @param {import('@aws-sdk/client-cloudformation').DescribeStacksCommandOutput} [describeStackResponse]
   */
  async refreshOutputs(cloudFormation, describeStackResponse) {
    if (!describeStackResponse) {
      describeStackResponse = await cloudFormation.send(
        new DescribeStacksCommand({
          StackName: this.stackName,
        })
      );
    }

    const outputs = {
      stack: this.stackName,
    };
    for (const output of describeStackResponse.Stacks[0]?.Outputs) {
      outputs[output.OutputKey] = output.OutputValue;
    }
    await this.updateOutputs(outputs);
  }
}

module.exports = AwsCloudformation;
