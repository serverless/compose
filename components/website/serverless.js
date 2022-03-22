'use strict';

const Component = require('../../src/Component');
const CdkDeploy = require('../cdk/Cdk');
const { App } = require('aws-cdk-lib');
const WebsiteConstruct = require('./WebsiteConstruct');
const { s3Sync } = require('./s3-sync');
const { CloudFrontClient, CreateInvalidationCommand } = require('@aws-sdk/client-cloudfront');
const { sdkConfig } = require('../cdk/sdk-config');

class Website extends Component {
  /** @type {string} */
  path;
  /** @type {string|undefined} */
  region;

  /**
   * @param {string} id
   * @param {import('../../src/Context')} context
   * @param {import('./Input').WebsiteInput} inputs
   */
  constructor(id, context, inputs) {
    super(id, context, inputs);

    this.stackName = `${this.appName}-${this.id}-${this.stage}`;
    // TODO validate input
    this.region = this.inputs.region;
  }

  async deploy() {
    this.startProgress('deploying');

    const app = new App();
    // @ts-ignore
    new WebsiteConstruct(app, this.stackName, this.inputs);

    const cdk = new CdkDeploy(this.logVerbose.bind(this), this.state, this.stackName, this.region);
    const hasInfrastructureChanges = await cdk.deploy(app);

    if (hasInfrastructureChanges) {
      // Save updated state
      await this.save();
      await this.updateOutputs(await cdk.getStackOutputs());
    }

    const filesChanged = await this.uploadWebsite();

    if (hasInfrastructureChanges || filesChanged > 0) {
      this.successProgress('deployed');
    } else {
      this.successProgress('no changes');
    }
  }

  async remove() {
    this.startProgress('removing');

    // TODO empty bucket

    const cdk = new CdkDeploy(this.logVerbose.bind(this), this.state, this.stackName, this.region);
    await cdk.remove();

    this.state = {};
    await this.save();
    await this.updateOutputs({});

    this.successProgress('removed');
  }

  async uploadWebsite() {
    this.updateProgress('uploading assets');

    const { hasChanges, fileChangeCount } = await s3Sync({
      localPath: this.inputs.path,
      bucketName: this.outputs.bucketName,
      logVerbose: this.logVerbose.bind(this),
    });
    if (hasChanges) {
      await this.clearCDNCache();
    }

    return fileChangeCount;
  }

  async clearCDNCache() {
    this.logVerbose(`Clearing CloudFront DNS cache`);
    this.updateProgress('clearing CDN cache');
    const cloudFrontClient = new CloudFrontClient(await sdkConfig());
    await cloudFrontClient.send(
      new CreateInvalidationCommand({
        DistributionId: this.outputs.distributionId,
        InvalidationBatch: {
          // This should be a unique ID: we use a timestamp
          CallerReference: Date.now().toString(),
          Paths: {
            // Invalidate everything
            Items: ['/*'],
            Quantity: 1,
          },
        },
      })
    );
  }
}

module.exports = Website;
