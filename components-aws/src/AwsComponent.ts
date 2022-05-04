import { Component, ComponentContext } from '@serverless/components';
import Cdk from './Cdk';
import sdkConfig from './sdk-config';

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

  getCdk(): Cdk {
    return new Cdk(this.context, this.stackName, this.region);
  }

  async getSdkConfig() {
    return await sdkConfig(this.region);
  }
}
