import { Component, ComponentContext } from '@serverless-components/core';
import Cdk from './Cdk';

export default abstract class AwsComponent extends Component {
  readonly stackName: string;
  readonly region: string;

  protected constructor(id: string, context: ComponentContext, inputs: Record<string, any>) {
    super(id, context, inputs);

    this.stackName = `${this.id}-${this.context.stage}`;
    // TODO validate input
    // TODO improve default region behavior
    this.region = this.inputs.region ?? 'us-east-1';
  }

  async getCdk(): Promise<Cdk> {
    return new Cdk(this.context, this.stackName, this.region, await this.getSdkConfig());
  }

  async getSdkConfig() {
    // TODO We should probably look at how AWS CDK resolves credentials.
    // The CDK has a tool that creates a preconfigured SDK (SdkProvider)
    // using credentials resolution compatible with the AWS CLI, and that
    // supports the AssumeRole of the ToolkitStack.
    // @see https://github.com/aws/aws-cdk/blob/fa16f7a9c11981da75e44ffc83adcdc6edad94fc/packages/aws-cdk/lib/cli.ts#L257-L264
    return {
      region: this.region,
    };
  }
}
