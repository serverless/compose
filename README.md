_**BETA:** This repository contains a beta version of a new Serverless Framework feature._

Deploy and orchestrate multiple Serverless Framework services in monorepositories.

```yaml
name: myapp

subscriptions:
  component: serverless-framework
  path: subscriptions

users:
  component: serverless-framework
  path: users
```

## Beta version

This repository contains a beta version of a new Serverless Framework feature: multi-service deployments.

While in beta, the feature is in a separate repository and NPM package. Eventually it will be merged in the main `serverless` CLI and project.

We use GitHub issues to discuss ideas and features: we encourage you to **subscribe** to GitHub repository notifications and get involved in discussions.

## Installation

While in beta, the feature ships as a separate package and CLI. Install it via NPM:

```bash
npm -g i @serverless/components-v4-beta
```

The CLI can now be used via the following command:

```bash
components-v4
```

_Note: while in beta, the feature is available via the `components-v4` command, not the main `serverless` CLI._

## Usage

The multi-service deployment feature is designed for **monorepositories**.

Assuming you have an application containing multiple Serverless Framework services, for example:

```bash
my-project/
  service-a/
    src/
      ...
    serverless.yml
  service-b/
    src/
      ...
    serverless.yml
```

You can now create a **new top-level** `serverless.yml` configuration file at the root of your mono-repository.

In that new file, you can reference existing Serverless Framework projects by their **relative paths**:

```yaml
# Name of the application
name: myapp

service-a:
  component: serverless-framework
  # Relative path to the Serverless Framework service
  path: service-a

service-b:
  component: serverless-framework
  # Relative path to the Serverless Framework service
  path: service-b
```

To deploy all services, instead of running `serverless deploy` in each service, you can now deploy all services at once via:

```bash
$ components-v4 deploy

Deploying myapp to stage dev

    ✔  service-a › deployed › 15s
    ✔  service-b › deployed › 31s

```

**⚠️ Warning:** The deployment will run `serverless deploy` in each service directory. If Serverless Framework is installed locally (in `node_modules/`) in some services, you need to make sure Serverless Framework v3.3.0 or greater is installed.

### Service dependencies and variables

Service variables let us:

- order deployments
- inject outputs from one service into another

This is possible via the `${component.output}` syntax. For example:

```yaml
service-a:
  component: serverless-framework
  path: service-a

service-b:
  component: serverless-framework
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

2. Because of the dependency introduced by the variable, `components-v4 deploy` will automatically **deploy `service-a` first, and then `service-b`.**

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

Alternatively, you can also specify explicit dependencies without passing any variables between services by setting `dependsOn` to a name of service in configuration. For example:

```yaml
service-a:
  component: serverless-framework
  path: service-a

service-b:
  component: serverless-framework
  path: service-b
  dependsOn: service-a

service-c:
  component: serverless-framework
  path: service-c

service-d:
  component: serverless-framework
  path: service-d
  dependsOn:
    - service-a
    - service-c
```

As seen in the above example, it is possible to configure more than one dependency by providing `dependsOn` as a list.

### Global commands

On top of `components-v4 deploy`, the following commands can be run globally across all services:

- `components-v4 info` to view all services outputs
- `components-v4 remove` to remove all services
- `components-v4 logs` to fetch logs from **all functions across all services**

For example, it is possible to tail logs for all functions at once:

```bash
$ components-v4 deploy --tail

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

It is possible to run commands for a specific component only. For example to deploy only a specific component:

```bash
components-v4 deploy --component=service-a

# Shortcut alternative
components-v4 service-a:deploy
```

Or tail logs of a single function:

```bash
components-v4 logs --component=service-a --function=index

# Shortcut alternative
components-v4 service-a:logs --function=index
```

All Serverless Framework commands are supported via service-specific commands, including custom commands from plugins.

## Differences with Serverless Framework configuration

Configuration files for deploying components (multiple services) and traditional Serverless Framework configuration files use the same name: `serverless.yml`.

However, the configuration format and features they offer are different. Unless documented here, expect any Serverless Framework feature **to not be supported**.

For example, it is not possible to include plugins in components configuration. Additionally, all Serverless Framework variables are not supported (yet).
