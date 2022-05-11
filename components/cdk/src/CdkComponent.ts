import { App, Stack } from 'aws-cdk-lib';
import { AwsComponent } from '@serverless-components/core-aws';
import * as path from 'path';

export default class CdkComponent extends AwsComponent {
  async deploy() {
    this.context.startProgress('deploying');

    const cdk = await this.getCdk();
    const app = this.createApp(cdk.artifactDirectory);
    const hasChanges = await cdk.deploy(app);
    if (!hasChanges) {
      this.context.successProgress('no changes');
      return;
    }

    this.context.outputs = await cdk.getStackOutputs();
    await this.context.save();
    this.context.successProgress('deployed');
  }

  async remove() {
    this.context.startProgress('removing');

    const cdk = await this.getCdk();
    const app = this.createApp(cdk.artifactDirectory);
    await cdk.remove(app);

    this.context.state = {};
    this.context.outputs = {};
    await this.context.save();

    this.context.successProgress('removed');
  }

  private createApp(artifactDirectory: string): App {
    const app = new App({
      outdir: artifactDirectory,
    });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ConstructClass = require(path.join(process.cwd(), this.inputs.construct));
    if (ConstructClass.prototype instanceof Stack) {
      new ConstructClass(app, this.stackName, this.inputs);
    } else {
      const stack = new Stack(app, this.stackName);
      new ConstructClass(stack, 'Construct', this.inputs);
    }
    return app;
  }

  info() {
    // TODO
  }

  refreshOutputs(): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
