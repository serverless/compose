import { App } from 'aws-cdk-lib';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { ServerlessError } from '@serverless/components';
import { AwsComponent } from '@serverless/components-aws';
import WebsiteConstruct from './WebsiteConstruct';
import { WebsiteInput } from './Input';
import S3Sync from './S3Sync';

export default class Website extends AwsComponent {
  constructor(id: string, context: never, inputs: WebsiteInput) {
    super(id, context, inputs);

    if (inputs.domain !== undefined && inputs.certificate === undefined) {
      throw new ServerlessError(
        `Invalid configuration for website '${this.id}': if a domain is configured, then a certificate ARN must be configured in the 'certificate' option`,
        'INVALID_WEBSITE_CONFIGURATION'
      );
    }
  }

  async deploy() {
    this.context.startProgress('deploying');

    const cdk = await this.getCdk();

    const app = new App({
      outdir: cdk.artifactDirectory,
    });
    new WebsiteConstruct(app, this.stackName, this.inputs as WebsiteInput);

    const hasInfrastructureChanges = await cdk.deploy(app);

    if (hasInfrastructureChanges) {
      await this.context.updateOutputs(await cdk.getStackOutputs());
    }

    const filesChanged = await this.uploadWebsite();

    if (hasInfrastructureChanges || filesChanged > 0) {
      this.context.successProgress('deployed');
    } else {
      this.context.successProgress('no changes');
    }
  }

  async remove() {
    this.context.startProgress('removing');

    const app = new App();
    new WebsiteConstruct(app, this.stackName, this.inputs as WebsiteInput);

    // TODO empty bucket

    const cdk = await this.getCdk();
    await cdk.remove(app);

    this.context.state = {};
    await this.context.save();
    await this.context.updateOutputs({});

    this.context.successProgress('removed');
  }

  info() {
    this.context.writeText(this.context.outputs.url);
  }

  refreshOutputs(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  private async uploadWebsite(): Promise<number> {
    this.context.updateProgress('uploading assets');

    const s3Sync = new S3Sync(await this.getSdkConfig(), this.context);
    const fileChangeCount = await s3Sync.s3Sync({
      localPath: this.inputs.path,
      bucketName: this.context.outputs.bucketName,
    });
    if (fileChangeCount > 0) {
      await this.clearCDNCache();
    }

    return fileChangeCount;
  }

  private async clearCDNCache() {
    const distributionId = this.context.outputs.distributionId;
    if (!distributionId) {
      return;
    }

    this.context.logVerbose('Clearing CloudFront DNS cache');
    this.context.updateProgress('clearing CDN cache');
    const cloudFrontClient = new CloudFrontClient(await this.getSdkConfig());
    await cloudFrontClient.send(
      new CreateInvalidationCommand({
        DistributionId: distributionId,
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
