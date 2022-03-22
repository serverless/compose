const { SdkProvider } = require('aws-cdk/lib/api/aws-auth/sdk-provider');
const { Mode } = require('aws-cdk/lib/api');

/**
 * Returns an SDK configuration (with credentials and all).
 *
 * TODO cache this?
 */
async function sdkConfig() {
  // The CDK has a tool that creates a preconfigured SDK (SdkProvider)
  // using credentials resolution compatible with the AWS CLI, and that
  // supports the AssumeRole of the ToolkitStack.
  // Not sure if we want to keep all of that, but for now let's use it.

  // @see https://github.com/aws/aws-cdk/blob/fa16f7a9c11981da75e44ffc83adcdc6edad94fc/packages/aws-cdk/lib/cli.ts#L257-L264
  const sdkProvider = await SdkProvider.withAwsCliCompatibleDefaults();
  const accountId = (await sdkProvider.defaultAccount())?.accountId;
  if (accountId === undefined) {
    throw new Error('No AWS account ID could be found via the AWS credentials');
  }
  const limitedCdkSdk = await sdkProvider.forEnvironment(
    {
      account: accountId,
      region: this.region,
    },
    Mode.ForReading
  );

  // TODO we need something better later
  // @ts-ignore
  return limitedCdkSdk.config;
}

module.exports = { sdkConfig };
