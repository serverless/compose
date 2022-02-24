**\*BETA:** This repository contains a beta version of a new Serverless Framework feature.\*

Deploy and orchestrate multiple Serverless Framework services in monorepositories.

```yaml
app: myapp

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
app: myapp

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

### Service dependencies and variables

TODO

### Global commands

TODO

- info
- logs

### Service-specific commands

TODO

### Supported Serverless Framework features

(not sure about this title)

Goal: explictly expose differences with traditionnal Serverless Framework configuration files.

TODO
