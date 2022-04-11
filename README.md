_**BETA:** This repository contains a beta version of a new Serverless Framework feature._

**Deploy and orchestrate multiple Serverless Framework services in monorepositories.**

- Deploy multiple services in parallel
- Deploy dependent services in a specific order
- Share outputs from one service to another
- Run commands across multiple services

```yaml
name: myapp

services:
  subscriptions:
    path: subscriptions

  users:
    path: users

  ...
```

You can also [check out and deploy the example](https://github.com/serverless/compose-example).

## Beta version

This repository contains a beta version of Serverless Framework Compose: a new feature providing multi-service deployments.

While in beta, this feature is in a separate repository and NPM package. Eventually, it will be merged in the main `serverless` CLI and project.

We use GitHub issues to discuss ideas and features. We encourage you to:

- **watch** the GitHub repository to be notified of releases and discussions
- get involved in GitHub issues

## Installation

While in beta, the feature ships as a separate package and CLI. Install it via NPM:

```bash
npm -g i @serverless/compose-beta
```

The CLI can now be used via the following command:

```bash
serverless-compose
```

or for short:

```bash
slsc
```

_Note: while in beta, the feature is available via the `serverless-compose` command, not the main `serverless` CLI._

## Usage

The multi-service deployment feature is designed for **monorepositories**.

Assuming you have an application containing multiple Serverless Framework services, for example:

```bash
my-app/
  service-a/
    src/
      ...
    serverless.yml
  service-b/
    src/
      ...
    serverless.yml
```

You can now create a `serverless-compose.yml` configuration file at the root of your monorepository.

_Note: You can also define your configuration with `serverless-compose.{ts,js,json,yaml}` files._

In that new file, you can reference existing Serverless Framework projects by their **relative paths**:

```yaml
# Name of the application
name: myapp

services:
  service-a:
    # Relative path to the Serverless Framework service
    path: service-a

  service-b:
    # Relative path to the Serverless Framework service
    path: service-b
    # If the file is not named "serverless.yml" it is possible to configure that:
    # config: serverless.api.yml
```

To deploy all services, instead of running `serverless deploy` in each service, you can now deploy all services at once via:

```bash
$ serverless-compose deploy

Deploying myapp to stage dev

    ✔  service-a › deployed › 15s
    ✔  service-b › deployed › 31s

```

**⚠️ Warning:** The deployment will run `serverless deploy` in each service directory. If Serverless Framework is installed locally (in `node_modules/`) in some services, you need to make sure Serverless Framework v3.3.0 or greater is installed.

### Service dependencies and variables

Service variables let us:

- order deployments
- inject outputs from one service into another

This is possible via the `${service.output}` syntax. For example:

```yaml
services:
  service-a:
    path: service-a

  service-b:
    path: service-b
    params:
      queueUrl: ${service-a.queueUrl}
```

Let's break down the example above into 3 steps:

1. `${service-a.queueUrl}` will resolve to the `queueUrl` output of the `service-a` service.

   The outputs of a Serverless Framework service are resolved from its **CloudFormation outputs**. Here is how we can expose the `queueUrl` output in the `service-a/serverless.yml` config:

   ```yaml
   # service-a/serverless.yml
   # ...

   resources:
     Resources:
       MyQueue:
         Type: AWS::SQS::Queue
         # ...
     Outputs:
       queueUrl:
         Value: !Ref MyQueue
   ```

2. Because of the dependency introduced by the variable, `serverless-compose deploy` will automatically **deploy `service-a` first, and then `service-b`.**

3. The value will be passed to `service-b` [as a parameter](https://www.serverless.com/framework/docs/guides/parameters) named `queueUrl`. Parameters can be referenced in Serverless Framework configuration via the `${param:xxx}` syntax:

   ```yaml
   # service-b/serverless.yml
   provider:
     ...
     environment:
       # Here we inject the queue URL as a Lambda environment variable
       SERVICE_A_QUEUE_URL: ${param:queueUrl}
   ```

Cross-services variables are a great way to share API URLs, queue URLs, database table names, and more, without having to hardcode resource names or use SSM.

Alternatively, you can also specify **explicit dependencies** without passing any variables between services by setting `dependsOn` to a name of service in configuration. For example:

```yaml
services:
  service-a:
    path: service-a

  service-b:
    path: service-b
    dependsOn: service-a

  service-c:
    path: service-c

  service-d:
    path: service-d
    dependsOn:
      - service-a
      - service-c
```

As seen in the above example, it is possible to configure more than one dependency by providing `dependsOn` as a list.

### Global commands

On top of `serverless-compose deploy`, the following commands can be run globally across all services:

- `serverless-compose info` to view all services outputs
- `serverless-compose remove` to remove all services
- `serverless-compose refresh-outputs` to refresh outputs of all services
- `serverless-compose logs` to fetch logs from **all functions across all services**
- `serverless-compose outputs` to view all services outputs

For example, it is possible to tail logs for all functions at once:

```bash
$ serverless-compose logs --tail

service-a › users › START
service-a › users › 2021-12-31 16:54:14  INFO  New user created
service-a › users › END Duration: 13 ms ...
service-b › subscriptions › START
service-b › subscriptions › 2021-12-31 16:54:14  INFO  New subscription enabled
service-b › subscriptions › END Duration: 7 ms ...

    ⠴  service-a › logs › 2s
    ⠦  service-a › logs › 2s

```

### Service-specific commands

It is possible to run commands for a specific service only. For example to deploy only a specific service:

```bash
serverless-compose deploy --service=service-a

# Shortcut alternative
serverless-compose service-a:deploy
```

Or tail logs of a single function:

```bash
serverless-compose logs --service=service-a --function=index

# Shortcut alternative
serverless-compose service-a:logs --function=index
```

All Serverless Framework commands are supported via service-specific commands, including custom commands from plugins.

### Service-specific commands when using parameters

The `serverless-compose service-a:deploy` command is the equivalent of running `serverless deploy` in service-a's directory. Both approaches can be used.

However, if "service-a" uses `${param:xxx}` to reference `serverless-compose.yml` parameters, then `serverless deploy` will not work. Indeed, `${param:xxx}` cannot be resolved outside of Serverless Framework compose.

In these cases, you must run all commands from the root: `serverless-compose service-a:deploy`.

## Differences with `serverless.yml`

Unless documented here, expect any `serverless.yml` feature to not be supported in `serverless-compose.yml`. For example, it is not possible to include plugins or use `serverless.yml` variables (like `${env:`, `${opt:`, etc.) inside `serverless-compose.yml`.

Feel free to open an issue if you need a feature that isn't supported at the moment.

## Refreshing outputs of already deployed services

If you need to refresh outputs of services that you already deployed previously, e.g. from different development machine, you can do it with the following command:

```
serverless-compose refresh-outputs
```

## Removing services

To delete the whole project (and all its services), run `serverless-compose remove`. This will run [`serverless remove`](https://www.serverless.com/framework/docs/providers/aws/cli-reference/remove) in each service.

To delete only one service:

1. run `serverless-compose <component>:remove`
2. then remove the service from `serverless-compose.yml`

If you remove the service from `serverless-compose.yml` without doing step 1 first the service will still be deployed in your AWS account.

Remember to do this for every stage you may have previously deployed.
