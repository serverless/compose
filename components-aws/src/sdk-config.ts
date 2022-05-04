/**
 * Returns an SDK configuration (with credentials and all).
 *
 * TODO cache this?
 */
export default async function sdkConfig(region: string) {
  // TODO We should probably look at how AWS CDK resolves credentials.
  // The CDK has a tool that creates a preconfigured SDK (SdkProvider)
  // using credentials resolution compatible with the AWS CLI, and that
  // supports the AssumeRole of the ToolkitStack.
  // @see https://github.com/aws/aws-cdk/blob/fa16f7a9c11981da75e44ffc83adcdc6edad94fc/packages/aws-cdk/lib/cli.ts#L257-L264

  // TODO
  return {
    region,
  };
}
