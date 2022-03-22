const { Stack, RemovalPolicy, CfnOutput } = require('aws-cdk-lib');
const ServerlessError = require('../../src/serverless-error');
const { Bucket } = require('aws-cdk-lib/aws-s3');
const { flatten } = require('ramda');
const {
  FunctionEventType,
  Distribution,
  AllowedMethods,
  HttpVersion,
  ViewerProtocolPolicy,
  CachePolicy,
} = require('aws-cdk-lib/aws-cloudfront');
const cloudfront = require('aws-cdk-lib/aws-cloudfront');
const acm = require('aws-cdk-lib/aws-certificatemanager');
const { S3Origin } = require('aws-cdk-lib/aws-cloudfront-origins');

class WebsiteConstruct extends Stack {
  /**
   * @param scope
   * @param {string} id
   * @param {import('./Input').WebsiteInput} props
   */
  constructor(scope, id, props) {
    super(scope, id);
    this.id = id;
    this.props = props;

    if (props.domain !== undefined && props.certificate === undefined) {
      throw new ServerlessError(
        `Invalid configuration for the static website '${id}': if a domain is configured, then a certificate ARN must be configured in the 'certificate' option.\n` +
          'See https://github.com/getlift/lift/blob/master/docs/static-website.md#custom-domain',
        'LIFT_INVALID_CONSTRUCT_CONFIGURATION'
      );
    }

    const bucket = new Bucket(this, 'Bucket', {
      // Enable static website hosting
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      // Required when static website hosting is enabled
      publicReadAccess: true,
      // For a static website, the content is code that should be versioned elsewhere
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Cast the domains to an array
    const domains = props.domain !== undefined ? flatten([props.domain]) : undefined;
    const certificate =
      props.certificate !== undefined
        ? acm.Certificate.fromCertificateArn(this, 'Certificate', props.certificate)
        : undefined;

    const distribution = new Distribution(this, 'CDN', {
      comment: `${this.stackName} ${id} website CDN`,
      defaultBehavior: {
        // Origins are where CloudFront fetches content
        origin: new S3Origin(bucket),
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        // Use the "Managed-CachingOptimized" policy
        // See https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html#managed-cache-policies-list
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [
          {
            eventType: FunctionEventType.VIEWER_REQUEST,
            function: this.createRequestFunction(),
          },
          {
            function: this.createResponseFunction(),
            eventType: FunctionEventType.VIEWER_RESPONSE,
          },
        ],
      },
      // Enable http2 transfer for better performances
      httpVersion: HttpVersion.HTTP2,
      certificate: certificate,
      domainNames: domains,
    });

    // CloudFormation outputs
    new CfnOutput(this, 'bucketName', {
      description: 'Name of the bucket that stores the static website.',
      value: bucket.bucketName,
    });
    let websiteDomain = distribution.distributionDomainName;
    if (props.domain !== undefined) {
      // In case of multiple domains, we take the first one
      websiteDomain = typeof props.domain === 'string' ? props.domain : props.domain[0];
    }
    new CfnOutput(this, 'domain', {
      description: 'Website domain name.',
      value: websiteDomain,
    });
    new CfnOutput(this, 'url', {
      description: 'Website URL.',
      value: `https://${websiteDomain}`,
    });
    new CfnOutput(this, 'cname', {
      description: 'CloudFront CNAME.',
      value: distribution.distributionDomainName,
    });
    new CfnOutput(this, 'distributionId', {
      description: 'ID of the CloudFront distribution.',
      value: distribution.distributionId,
    });
  }

  /**
   * @return {cloudfront.Function}
   */
  createRequestFunction() {
    /**
     * CloudFront function that redirects nested paths to /index.html and
     * let static files pass.
     *
     * Files extensions list taken from: https://docs.aws.amazon.com/amplify/latest/userguide/redirects.html#redirects-for-single-page-web-apps-spa
     */
    const code = `var REDIRECT_REGEX = /^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/;

function handler(event) {
    var uri = event.request.uri;
    var isUriToRedirect = REDIRECT_REGEX.test(uri);

    if (isUriToRedirect) event.request.uri = "/index.html";

    return event.request;
}`;

    return new cloudfront.Function(this, 'RequestFunction', {
      functionName: `${this.stackName}-${this.region}-${this.id}-request`,
      code: cloudfront.FunctionCode.fromInline(code),
    });
  }

  /**
   * @return {cloudfront.Function}
   */
  createResponseFunction() {
    const securityHeaders = {
      'x-frame-options': { value: 'SAMEORIGIN' },
      'x-content-type-options': { value: 'nosniff' },
      'x-xss-protection': { value: '1; mode=block' },
      'strict-transport-security': { value: 'max-age=63072000' },
    };
    if (this.props.security?.allowIframe === true) {
      delete securityHeaders['x-frame-options'];
    }
    const jsonHeaders = JSON.stringify(securityHeaders, undefined, 4);
    /**
     * CloudFront function that manipulates the HTTP responses to add security headers.
     */
    const code = `function handler(event) {
    var response = event.response;
    response.headers = Object.assign({}, ${jsonHeaders}, response.headers);
    return response;
}`;

    return new cloudfront.Function(this, 'ResponseFunction', {
      functionName: `${this.stackName}-${this.region}-${this.id}-response`,
      code: cloudfront.FunctionCode.fromInline(code),
    });
  }
}

module.exports = WebsiteConstruct;
