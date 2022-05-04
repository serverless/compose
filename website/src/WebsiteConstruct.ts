import { CfnOutput, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Bucket, BucketProps } from 'aws-cdk-lib/aws-s3';
import { flatten } from 'lodash';
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  FunctionEventType,
  HttpVersion,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';
import { ServerlessError } from '@serverless/components';
import { WebsiteInput } from './Input';

export default class WebsiteConstruct extends Stack {
  private readonly id: string;
  private readonly props: WebsiteInput;

  constructor(scope: Construct, id: string, props: WebsiteInput) {
    super(scope, id);
    this.id = id;
    this.props = props;

    // Cast the domains to an array
    const domains = props.domain !== undefined ? flatten([props.domain]) : undefined;

    let bucketProps: BucketProps = {
      // For a static website, the content is code that should be versioned elsewhere
      removalPolicy: RemovalPolicy.DESTROY,
    };

    // If no custom domain, we switch to S3 static website hosting
    if (!domains) {
      bucketProps = {
        ...bucketProps,
        // Enable static website hosting
        websiteIndexDocument: 'index.html',
        websiteErrorDocument: 'index.html',
        // Required when static website hosting is enabled
        publicReadAccess: true,
      };
    }

    const bucket = new Bucket(this, 'Bucket', bucketProps);
    new CfnOutput(this, 'bucketName', {
      description: 'Name of the bucket that stores the static website.',
      value: bucket.bucketName,
    });
    // In case of multiple domains, we take the first one
    new CfnOutput(this, 'domain', {
      description: 'Website domain name.',
      value: domains ? domains[0] : bucket.bucketWebsiteDomainName,
    });
    new CfnOutput(this, 'url', {
      description: 'Website URL.',
      // S3 URLs are HTTP-only
      value: domains ? `https://${domains[0]}` : `http://${bucket.bucketWebsiteDomainName}`,
    });

    // Skip creating CloudFront unless a domain is configured
    // That makes dev deployments much faster (since we only create the S3 bucket)
    if (!domains) {
      return;
    }

    const certificate =
      props.certificate !== undefined
        ? Certificate.fromCertificateArn(this, 'Certificate', props.certificate)
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
            function: this.createRequestFunction(domains),
          },
          {
            function: this.createResponseFunction(),
            eventType: FunctionEventType.VIEWER_RESPONSE,
          },
        ],
      },
      // Enable http2 transfer for better performances
      httpVersion: HttpVersion.HTTP2,
      certificate,
      domainNames: domains,
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

  private createRequestFunction(domains: string[] | undefined): cloudfront.Function {
    let additionalCode = '';

    if (this.props.redirectToMainDomain === true) {
      additionalCode += this.redirectToMainDomain(domains);
    }

    /**
     * CloudFront function that redirects nested paths to /index.html and
     * let static files pass.
     *
     * Files extensions list taken from: https://docs.aws.amazon.com/amplify/latest/userguide/redirects.html#redirects-for-single-page-web-apps-spa
     * Add xml as well
     */
    const code = `var REDIRECT_REGEX = /^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|xml)$)([^.]+$)/;

function handler(event) {
    var uri = event.request.uri;
    var request = event.request;
    var isUriToRedirect = REDIRECT_REGEX.test(uri);

    if (isUriToRedirect) {
        request.uri = "/index.html";
    }${additionalCode}

    return event.request;
}`;

    return new cloudfront.Function(this, 'RequestFunction', {
      functionName: `${this.stackName}-${this.region}-${this.id}-request`,
      code: cloudfront.FunctionCode.fromInline(code),
    });
  }

  private createResponseFunction(): cloudfront.Function {
    const securityHeaders: Record<string, { value: string }> = {
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

  private redirectToMainDomain(domains: string[] | undefined): string {
    if (domains === undefined || domains.length < 2) {
      throw new ServerlessError(
        "Invalid value in 'redirectToMainDomain': you must have at least 2 domains configured to enable redirection to the main domain.",
        'INVALID_COMPONENT_CONFIGURATION'
      );
    }

    const mainDomain = domains[0];

    return `
    if (request.headers["host"].value !== "${mainDomain}") {
        return {
            statusCode: 301,
            statusDescription: "Moved Permanently",
            headers: {
                location: {
                    value: "https://${mainDomain}" + request.uri
                }
            }
        };
    }`;
  }
}
