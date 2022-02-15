const Component = require("../../src/Component");
const path = require("path");
const child_process = require("child_process");
const yaml = require("yaml");
const Serverless = require("../../../serverless/lib/Serverless");
const resolveConfigurationPath = require("../../../serverless/lib/cli/resolve-configuration-path");
const readConfiguration = require("../../../serverless/lib/configuration/read");
const resolveVariables = require("../../../serverless/lib/configuration/variables");
const resolveVariablesMeta = require("../../../serverless/lib/configuration/variables/resolve-meta");
const resolveProviderName = require("../../../serverless/lib/configuration/resolve-provider-name");
const handleError = require("../../../serverless/lib/cli/handle-error");
const ServerlessError = require("../../../serverless/lib/serverless-error");
const isPropertyResolved = require("../../../serverless/lib/configuration/variables/is-property-resolved");
const eventuallyReportVariableResolutionErrors = require("../../../serverless/lib/configuration/variables/eventually-report-resolution-errors");
const filterSupportedOptions = require("../../../serverless/lib/cli/filter-supported-options");
const humanizePropertyPathKeys = require('../../../serverless/lib/configuration/variables/humanize-property-path-keys');


// TODO: Resolving outputs
// TODO: Silencing the output/progress
// TODO: Error handling

class ServerlessFrameworkDirect extends Component {
  async wipRunCommand(command) {
    // TODO: resolve input will have to be adjusted for programmatic approach
    // const resolveInput = require("../lib/cli/resolve-input");

    const variableSourcesInConfig = new Set();
    // TODO: Check if we need it
    const commands = [command];
    // TODO: THIS SHOULD BE RESOLVED FROM ACTUALLY PASSED OPTIONS
    const options = { stage: this.context.stage };
    // COMPONENTS: Assumption about command being supported
    // Parse args against schemas of commands which do not require to be run in service context
    // ({ command, commands, options, isHelpRequest, commandSchema } =
    //   resolveInput(require("../lib/cli/commands-schema/no-service")));

    // COMPONENTS: VERSION SHOULD BE HANDLED ON HIGHER LEVEL

    // If version number request, show it and abort
    // if (options.version) {
    //   await require("../lib/cli/render-version")();
    //   await finalize();
    //   return;
    // }


    // COMPONENTS: NO SCHEMA VALIDATION FOR NOW

    // Abort if command is not supported in this environment
    // if (
    //   commandSchema &&
    //   commandSchema.isHidden &&
    //   commandSchema.noSupportNotice
    // ) {
    //   throw new ServerlessError(
    //     `Cannot run \`${command}\` command: ${commandSchema.noSupportNotice}`,
    //     "NOT_SUPPORTED_COMMAND"
    //   );
    // }

    const path = require("path");
    const uuid = require("uuid");
    const _ = require("lodash");
      const clear = require("ext/object/clear");
    let configurationPath = null;
    let providerName;
    let variablesMeta;
    let resolverConfiguration;
    let isInteractiveSetup;
    let configuration;
      let serviceDir;

    const ensureResolvedProperty = (propertyPath) => {
      if (isPropertyResolved(variablesMeta, propertyPath)) return true;
      variablesMeta = null;
      // COMPONENTS: HELP NOT SUPPORTED FOR NOW
      // if (isHelpRequest) return false;
      const humanizedPropertyPath = humanizePropertyPathKeys(
        propertyPath.split("\0")
      );
      throw new ServerlessError(
        `Cannot resolve ${path.basename(
          configurationPath
        )}: "${humanizedPropertyPath}" property is not accessible ` +
          "(configured behind variables which cannot be resolved at this stage)",
        "INACCESSIBLE_CONFIGURATION_PROPERTY"
      );
    };

      // COMPONENTS: LETS ALWAYS ASSUME WE'RE RUNNING service-specific command
      if (true) {
    // if (!commandSchema || commandSchema.serviceDependencyMode) {
      // Command is potentially service specific, follow up with resolution of service config

      // COMPONENTS: NEXT STEP SKIPPED FOR NOW
      // Parse args again, taking acounnt schema of service-specific flags
      // as they may influence configuration resolution
      // resolveInput.clear();
      // ({ command, commands, options, isHelpRequest, commandSchema } =
      //   resolveInput(require("../lib/cli/commands-schema/service")));

      // COMPONENTS: INTERACTIVE NOT SUPPORTED FOR NOW
      // isInteractiveSetup = !isHelpRequest && command === "";

      // COMPONENTS: FOR NOW, ASSUME THE CONFIGURATION PATH
      // const resolveConfigurationPath = require("../lib/cli/resolve-configuration-path");
      // Resolve eventual service configuration path

      // configurationPath = await resolveConfigurationPath();
      configurationPath = path.resolve(
          process.cwd(),
          this.inputs.path,
          "serverless.yml"
      );

      // If service configuration file is found, load its content
      configuration = configurationPath
        ? await (async () => {
            try {
              return await readConfiguration(configurationPath);
            } catch (error) {
              // COMPONENTS: HELP NOT SUPPORTED FOR NOW
              // if (isHelpRequest) return null;
              throw error;
            }
          })()
        : null;

      if (configuration) {
        // COMPONENTS: SIMPLIFIED ASSUMPTION ABOUT SERVICE DIR
          serviceDir = path.resolve(process.cwd(), this.inputs.path);

        // IIFE for maintenance convenience
        await (async () => {

          variablesMeta = resolveVariablesMeta(configuration);

          if (
            eventuallyReportVariableResolutionErrors(
              configurationPath,
              configuration,
              variablesMeta
            )
          ) {
            // Variable syntax errors, abort
            variablesMeta = null;
            return;
          }

          if (!ensureResolvedProperty("disabledDeprecations")) return;
          if (!ensureResolvedProperty("deprecationNotificationMode")) return;

          if (isPropertyResolved(variablesMeta, "provider\0name")) {
            providerName = resolveProviderName(configuration);
            if (providerName == null) {
              variablesMeta = null;
              return;
            }
          }
          // COMPONENTS: NO VALIDATION FOR NOW
          // if (!commandSchema && providerName === "aws") {
          //   // If command was not recognized in previous resolution phases
          //   // parse args again also against schemas commands which require AWS service context
          //   resolveInput.clear();

          //   ({ command, commands, options, isHelpRequest, commandSchema } =
          //     resolveInput(require("../lib/cli/commands-schema/aws-service")));
          // }

          let envVarNamesNeededForDotenvResolution;
          if (variablesMeta.size) {
            // Some properties are configured with variables

            // Resolve eventual variables in `provider.stage` and `useDotEnv`
            // (required for reliable .env resolution)
            resolverConfiguration = {
              serviceDir,
              configuration,
              variablesMeta,
              sources: {
                env: require("../../../serverless/lib/configuration/variables/sources/env"),
                  file: require("../../../serverless/lib/configuration/variables/sources/file"),
                  opt: require("../../../serverless/lib/configuration/variables/sources/opt"),
                  self: require("../../../serverless/lib/configuration/variables/sources/self"),
                  strToBool: require("../../../serverless/lib/configuration/variables/sources/str-to-bool"),
                  sls: require("../../../serverless/lib/configuration/variables/sources/instance-dependent/get-sls")(),
              },
              options,
              // COMPONENTS: NO SUPPORT FOR FILERING SUPPORTED OPTIONS FOR NOW
              // options: filterSupportedOptions(options, {
              //   commandSchema,
              //   providerName,
              // }),
              fulfilledSources: new Set(["file", "self", "strToBool"]),
              propertyPathsToResolve: new Set([
                "provider\0name",
                "provider\0stage",
                "useDotenv",
              ]),
              variableSourcesInConfig,
            };
            // COMPONENTS: NO SUPPORT FOR INTERACTIVE FOR NOW
            // if (isInteractiveSetup)
            //   resolverConfiguration.fulfilledSources.add("opt");
            await resolveVariables(resolverConfiguration);

            if (
              eventuallyReportVariableResolutionErrors(
                configurationPath,
                configuration,
                variablesMeta
              )
            ) {
              // Unrecoverable resolution errors, abort
              variablesMeta = null;
              return;
            }

            if (
              !providerName &&
              isPropertyResolved(variablesMeta, "provider\0name")
            ) {
              providerName = resolveProviderName(configuration);
              if (providerName == null) {
                variablesMeta = null;
                return;
              }
              // COMPONENTS: SCHEMA VALIDATION NOT SUPPORTED FOR NOW
              // if (!commandSchema && providerName === "aws") {
              //   // If command was not recognized in previous resolution phases
              //   // Parse args again also against schemas of commands which work in context of an AWS
              //   // service
              //   resolveInput.clear();
              //   ({ command, commands, options, isHelpRequest, commandSchema } =
              //     resolveInput(
              //       require("../lib/cli/commands-schema/aws-service")
              //     ));

              //   if (commandSchema) {
              //     resolverConfiguration.options = filterSupportedOptions(
              //       options,
              //       {
              //         commandSchema,
              //         providerName,
              //       }
              //     );
              //     await resolveVariables(resolverConfiguration);
              //     if (
              //       eventuallyReportVariableResolutionErrors(
              //         configurationPath,
              //         configuration,
              //         variablesMeta
              //       )
              //     ) {
              //       variablesMeta = null;
              //       return;
              //     }
              //   }
              // }
            }

            resolverConfiguration.fulfilledSources.add("env");
            if (
              !isPropertyResolved(variablesMeta, "provider\0stage") ||
              !isPropertyResolved(variablesMeta, "useDotenv")
            ) {
              // Assume "env" source fulfilled for `provider.stage` and `useDotenv` resolution.
              // To pick eventual resolution conflict, track what env variables were reported
              // misssing when applying this resolution
              const envSource = require("../../../serverless/lib/configuration/variables/sources/env");
              envSource.missingEnvVariables.clear();
              await resolveVariables({
                ...resolverConfiguration,
                propertyPathsToResolve: new Set([
                  "provider\0stage",
                  "useDotenv",
                ]),
              });
              if (
                eventuallyReportVariableResolutionErrors(
                  configurationPath,
                  configuration,
                  variablesMeta
                )
              ) {
                // Unrecoverable resolution errors, abort
                variablesMeta = null;
                return;
              }

              if (
                !ensureResolvedProperty("provider\0stage", {
                  shouldSilentlyReturnIfLegacyMode: true,
                })
              ) {
                return;
              }

              if (!ensureResolvedProperty("useDotenv")) return;

              envVarNamesNeededForDotenvResolution =
                envSource.missingEnvVariables;
            }
          }

          // COMPONENTS: SKIP LOADING ENV VARS HERE - it needs to be loaded on a higher level
          // Load eventual environment variables from .env files
          // if (
          //   await require("../lib/cli/conditionally-load-dotenv")(
          //     options,
          //     configuration
          //   )
          // ) {
          //   if (envVarNamesNeededForDotenvResolution) {
          //     for (const envVarName of envVarNamesNeededForDotenvResolution) {
          //       if (process.env[envVarName]) {
          //         throw new ServerlessError(
          //           'Cannot reliably resolve "env" variables due to resolution conflict.\n' +
          //             `Environment variable "${envVarName}" which influences resolution of ` +
          //             '".env" file were found to be defined in resolved ".env" file.' +
          //             "DOTENV_ENV_VAR_RESOLUTION_CONFLICT"
          //         );
          //       }
          //     }
          //   }
          //   if (!isPropertyResolved(variablesMeta, "provider\0name")) {
          //     await resolveVariables(resolverConfiguration);
          //     if (
          //       eventuallyReportVariableResolutionErrors(
          //         configurationPath,
          //         configuration,
          //         variablesMeta
          //       )
          //     ) {
          //       variablesMeta = null;
          //       return;
          //     }
          //   }
          // }

          if (!variablesMeta.size) return; // No properties configured with variables

          if (!providerName) {
            if (!ensureResolvedProperty("provider\0name")) return;
            providerName = resolveProviderName(configuration);
            if (providerName == null) {
              variablesMeta = null;
              return;
            }
            // COMPONENTS: NO SCHEMA RESOLUTION FOR NOW
            // if (!commandSchema && providerName === "aws") {
            //   resolveInput.clear();
            //   ({ command, commands, options, isHelpRequest, commandSchema } =
            //     resolveInput(
            //       require("../lib/cli/commands-schema/aws-service")
            //     ));
            //   if (commandSchema) {
            //     resolverConfiguration.options = filterSupportedOptions(
            //       options,
            //       {
            //         commandSchema,
            //         providerName,
            //       }
            //     );
            //   }
            // }
          }

          // COMPONENTS: NO HELP OR PLUGIN SUBCOMMANDS SUPPORTED FOR NOW
          // if (isHelpRequest || commands[0] === "plugin") {
          //   // We do not need full config resolved, we just need to know what
          //   // provider is service setup with, and with what eventual plugins Framework is extended
          //   // as that influences what CLI commands and options could be used,
          //   resolverConfiguration.propertyPathsToResolve.add("plugins");
          // } else {
          //   delete resolverConfiguration.propertyPathsToResolve;
          // }

          await resolveVariables(resolverConfiguration);
          if (
            eventuallyReportVariableResolutionErrors(
              configurationPath,
              configuration,
              variablesMeta
            )
          ) {
            variablesMeta = null;
            return;
          }

          if (!variablesMeta.size) return; // All properties successuflly resolved

          if (!ensureResolvedProperty("plugins")) return;
          if (!ensureResolvedProperty("package\0path")) return;

          if (!ensureResolvedProperty("frameworkVersion")) return;
          if (!ensureResolvedProperty("app")) return;
          if (!ensureResolvedProperty("org")) return;
          if (!ensureResolvedProperty("service")) return;
          if (configuration.org) {
            // Dashboard requires AWS region to be resolved upfront
            ensureResolvedProperty("provider\0region");
          }
        })();

        // COMPONENTS: SKIP SCHEMA VALIDATION FOR NOW
        // Ensure to have full AWS commands schema loaded if we're in context of AWS provider
        // It's not the case if not AWS service specific command was resolved
        // if (configuration && resolveProviderName(configuration) === "aws") {
        //   resolveInput.clear();
        //   ({ command, commands, options, isHelpRequest, commandSchema } =
        //     resolveInput(require("../lib/cli/commands-schema/aws-service")));
        // }
      } else {
        // In non-service context we recognize all AWS service commands
        // resolveInput.clear();
        // ({ command, commands, options, isHelpRequest, commandSchema } =
        //   resolveInput(require("../lib/cli/commands-schema/aws-service")));

        // Validate result command and options
        // COMPONENTS: SKIP CHECKING IF COMMAND IS ACTUALLY SUPPORTED
        // require("../lib/cli/ensure-supported-command")();
      }
    } else {
      // COMPONENTS: SKIP CHECKING IF COMMAND IS ACTUALLY SUPPORTED
      // require("../lib/cli/ensure-supported-command")();
    }

    const configurationFilename =
      configuration && configurationPath.slice(serviceDir.length + 1);

    // Names of the commands which are configured independently in root `commands` folder
    // and not in Serverless class internals
    const notIntegratedCommands = new Set([
      "doctor",
      "plugin install",
      "plugin uninstall",
    ]);
    const isStandaloneCommand = notIntegratedCommands.has(command);

    // COMPONENTS: SKIP SUPPORT FOR STANDALONE, INTERACTIVE AND HELP FOR NOW
    // if (!isHelpRequest && (isInteractiveSetup || isStandaloneCommand)) {
    //   if (configuration)
    //     require("../lib/cli/ensure-supported-command")(configuration);
    //   if (isInteractiveSetup) {
    //     if (!isInteractiveTerminal) {
    //       throw new ServerlessError(
    //         "Attempted to run an interactive setup in non TTY environment.\n" +
    //           "If that's intended, run with the SLS_INTERACTIVE_SETUP_ENABLE=1 environment variable",
    //         "INTERACTIVE_SETUP_IN_NON_TTY"
    //       );
    //     }
    //     const interactiveContext =
    //       await require("../lib/cli/interactive-setup")({
    //         configuration,
    //         serviceDir,
    //         configurationFilename,
    //         options,
    //         commandUsage,
    //       });
    //     if (interactiveContext.configuration) {
    //       configuration = interactiveContext.configuration;
    //     }
    //     if (interactiveContext.serverless) {
    //       serverless = interactiveContext.serverless;
    //     }
    //   } else {
    //     await require(`../commands/${commands.join("-")}`)({
    //       configuration,
    //       serviceDir,
    //       configurationFilename,
    //       options,
    //     });
    //   }

    //   await finalize({
    //     telemetryData: { outcome: "success", shouldSendTelemetry: true },
    //   });
    //   return;
    // }

    const serverless = new Serverless({
      configuration,
      serviceDir,
      configurationFilename,
      isConfigurationResolved:
        commands[0] === "plugin" ||
        Boolean(variablesMeta && !variablesMeta.size),
      commands,
      options,
    });

    try {
      // COMPONENTS: SKIPPING THIS FOR NOW
      // serverless.onExitPromise = processSpanPromise;
      serverless.invocationId = uuid.v4();
      await serverless.init();

      // IIFE for maintanance convenience
      await (async () => {
        if (!configuration) return;
        let hasFinalCommandSchema = false;
        if (configuration.plugins) {
          // After plugins are loaded, re-resolve CLI command and options schema as plugin
          // might have defined extra commands and options

          if (serverless.pluginManager.externalPlugins.size) {
            // COMPONENTS: SKIP THAT RESOLUTION FOR NOW
            // const commandsSchema =
            //   require("../lib/cli/commands-schema/resolve-final")(
            //     serverless.pluginManager.externalPlugins,
            //     { providerName: providerName || "aws", configuration }
            //   );
            // resolveInput.clear();
            // ({ command, commands, options, isHelpRequest, commandSchema } =
            //   resolveInput(commandsSchema));
            serverless.processedInput.commands =
              serverless.pluginManager.cliCommands = commands;
            serverless.processedInput.options = options;
            Object.assign(clear(serverless.pluginManager.cliOptions), options);
            hasFinalCommandSchema = true;
          }
        }
        if (!providerName && !hasFinalCommandSchema) {
          // COMPONENTS: SKIP THAT RESOLUTION FOR NOW
          // // Invalid configuration, ensure to recognize all AWS commands
          // resolveInput.clear();
          // ({ command, commands, options, isHelpRequest, commandSchema } =
          //   resolveInput(require("../lib/cli/commands-schema/aws-service")));
        }
        hasFinalCommandSchema = true;

        // Validate result command and options
        // COMPONENTS: SKIP THIS PART
        // if (hasFinalCommandSchema)
        //   require("../lib/cli/ensure-supported-command")(configuration);
        // if (isHelpRequest) return;
        if (!_.get(variablesMeta, "size")) return;

        // COMPONENTS: SKIP FILTERING FOR NOW
        // if (commandSchema) {
        //   resolverConfiguration.options = filterSupportedOptions(options, {
        //     commandSchema,
        //     providerName,
        //   });
        // }
        resolverConfiguration.fulfilledSources.add("opt");

        // Register serverless instance specific variable sources
        resolverConfiguration.sources.sls =
          require("../../../serverless/lib/configuration/variables/sources/instance-dependent/get-sls")(
            serverless
          );
        resolverConfiguration.fulfilledSources.add("sls");

        resolverConfiguration.sources.param =
          serverless.pluginManager.dashboardPlugin.configurationVariablesSources.param;
        resolverConfiguration.fulfilledSources.add("param");

        // Register dashboard specific variable source resolvers
        if (configuration.org) {
          for (const [sourceName, sourceConfig] of Object.entries(
            serverless.pluginManager.dashboardPlugin
              .configurationVariablesSources
          )) {
            if (sourceName === "param") continue;
            resolverConfiguration.sources[sourceName] = sourceConfig;
            resolverConfiguration.fulfilledSources.add(sourceName);
          }
        }

        // Register AWS provider specific variable sources
        if (providerName === "aws") {
          // Pre-resolve to eventually pick not yet resolved AWS auth related properties
          await resolveVariables(resolverConfiguration);
          if (!variablesMeta.size) return;
          if (
            eventuallyReportVariableResolutionErrors(
              configurationPath,
              configuration,
              variablesMeta
            )
          ) {
            return;
          }

          // Ensure properties which are crucial to some variable source resolvers
          // are actually resolved.
          if (
            !ensureResolvedProperty("provider\0credentials") ||
            !ensureResolvedProperty(
              "provider\0deploymentBucket\0serverSideEncryption"
            ) ||
            !ensureResolvedProperty("provider\0profile") ||
            !ensureResolvedProperty("provider\0region")
          ) {
            return;
          }
          Object.assign(resolverConfiguration.sources, {
            cf: require("../../../serverless/lib/configuration/variables/sources/instance-dependent/get-cf")(
              serverless
            ),
            s3: require("../../../serverless/lib/configuration/variables/sources/instance-dependent/get-s3")(
              serverless
            ),
            ssm: require("../../../serverless/lib/configuration/variables/sources/instance-dependent/get-ssm")(
              serverless
            ),
            aws: require("../../../serverless/lib/configuration/variables/sources/instance-dependent/get-aws")(
              serverless
            ),
          });
          resolverConfiguration.fulfilledSources
            .add("cf")
            .add("s3")
            .add("ssm")
            .add("aws");
        }

        // Register variable source resolvers provided by external plugins
        const resolverExternalPluginSources = require("../../../serverless/lib/configuration/variables/sources/resolve-external-plugin-sources");
        resolverExternalPluginSources(
          configuration,
          resolverConfiguration,
          serverless.pluginManager.externalPlugins
        );

        // Having all source resolvers configured, resolve variables
        await resolveVariables(resolverConfiguration);
        if (!variablesMeta.size) return;
        if (
          eventuallyReportVariableResolutionErrors(
            configurationPath,
            configuration,
            variablesMeta
          )
        ) {
          return;
        }

        // Do not confirm on unresolved sources with partially resolved configuration
        if (resolverConfiguration.propertyPathsToResolve) return;

        // Report unrecognized variable sources found in variables configured in service config
        const unresolvedSources =
          require("../../../serverless/lib/configuration/variables/resolve-unresolved-source-types")(
            variablesMeta
          );
        const recognizedSourceNames = new Set(
          Object.keys(resolverConfiguration.sources)
        );

        const unrecognizedSourceNames = Array.from(
          unresolvedSources.keys()
        ).filter((sourceName) => !recognizedSourceNames.has(sourceName));

        if (unrecognizedSourceNames.includes("output")) {
          throw new ServerlessError(
            '"Cannot resolve configuration: ' +
              '"output" variable can only be used in ' +
              'services deployed with Serverless Dashboard (with "org" setting configured)',
            "DASHBOARD_VARIABLE_SOURCES_MISUSE"
          );
        }
        throw new ServerlessError(
          `Unrecognized configuration variable sources: "${unrecognizedSourceNames.join(
            '", "'
          )}"`,
          "UNRECOGNIZED_VARIABLE_SOURCES"
        );
      })();

      // COMPONENTS: SKIP SUPPORT FOR HELP FOR NOW
      // if (isHelpRequest && serverless.pluginManager.externalPlugins) {
      //   // Show help
      //   require("../lib/cli/render-help")(
      //     serverless.pluginManager.externalPlugins
      //   );
      // } else {
        // Run command
        await serverless.run();
        return serverless;
      // }
    } catch (error) {
      // If Dashboard Plugin, capture error
      const dashboardPlugin = serverless.pluginManager.dashboardPlugin;
      const dashboardErrorHandler = _.get(
        dashboardPlugin,
        "enterprise.errorHandler"
      );
      if (!dashboardErrorHandler) throw error;
      try {
        await dashboardErrorHandler(error, serverless.invocationId);
      } catch (dashboardErrorHandlerError) {
        // const tokenizeException = require("../lib/utils/tokenize-exception");
        // const exceptionTokens = tokenizeException(dashboardErrorHandlerError);
        // log.warning(
        //   `Publication to Serverless Dashboard errored with:\n${" ".repeat(
        //     "Serverless: ".length
        //   )}${
        //     exceptionTokens.isUserError || !exceptionTokens.stack
        //       ? exceptionTokens.message
        //       : exceptionTokens.stack
        //   }`
        // );
      }
      throw error;
    }
  }

  async runCommand(command) {
    // TODO: Implement better input resolution - schema validation, etc
    const configurationPath = path.resolve(
      process.cwd(),
      this.inputs.path,
      "serverless.yml"
    );
    const configuration = await readConfiguration(configurationPath);
    await resolveVariables({
      servicePath: path.dirname(configurationPath),
      configuration,
      options: {},
    });
    const serverless = new Serverless({
      configuration,
      serviceDir: this.inputs.path,
      configurationFilename: "serverless.yml",
      isConfigurationResolved: true,
      commands: [command],
      options: {
        stage: this.context.stage,
      },
    });
    await serverless.init();
    try {
      await serverless.run();
    } catch (e) {
        console.log('RAW', e)
      await handleError(e, { serverless });
    }
    return serverless;
  }

  async deploy() {
    const serverless = await this.wipRunCommand("deploy");
    // TODO: save outputs
    console.log(serverless.serviceOutputs);
  }

  async remove() {
    const serverless = await this.wipRunCommand("remove");

    this.state = {};
    await this.save();
    await this.updateOutputs({});
  }

}

module.exports = ServerlessFrameworkDirect;
