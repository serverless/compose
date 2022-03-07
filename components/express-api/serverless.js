'use strict';

require('fs-extra');
require('crypto');
const Component = require('../../src/Component');
require('../aws-cloudformation/serverless');
const CdkDeploy = require('./Cdk');
const path = require('path');
const {App, Stack} = require('aws-cdk-lib');

class ExpressApi extends Component {
  /** @type {string|undefined} */
  region;

  constructor(id, context, inputs) {
    super(id, context, inputs);

    this.stackName = `${this.appName}-${this.id}-${this.stage}`;
    this.region = this.inputs.region;
  }

  async deploy() {
    this.startProgress('deploying');

    // Load the CDK construct and turn it into a proper "CDK App"
    const app = new App();
    let ConstructClass
    if (typeof this.inputs.construct === 'string') {
      ConstructClass = require(path.join(process.cwd(), this.inputs.construct));
    } else {
      ConstructClass = this.inputs.construct;
    }
    if (ConstructClass.prototype instanceof Stack) {
      new ConstructClass(app, this.stackName, this.inputs);
    } else {
      let stack = new Stack(app, this.stackName);
      new ConstructClass(stack, 'Construct', this.inputs);
    }

    const cdk = new CdkDeploy(this.logVerbose, this.state, this.stackName, this.region);
    const hasChanges = await cdk.deploy(app);

    if (hasChanges) {
      // Save updated state
      await this.save();
      await this.updateOutputs(await cdk.getStackOutputs());
      this.successProgress('deployed');
    } else {
      this.successProgress('no changes');
    }
  }

  async remove() {
    this.startProgress('removing');

    const cdk = new CdkDeploy(this.logVerbose, this.state, this.stackName, this.region);
    await cdk.remove();

    this.state = {};
    await this.save();
    await this.updateOutputs({});

    this.successProgress('removed');
  }
}

module.exports = ExpressApi;
