"use strict";

class ParamPlugin {
  constructor() {
    this.commands = {
      deploy: {
        options: {
          param: {
            type: "multiple",
          },
        },
        commands: {
          function: {
            options: {
              param: {
                type: "multiple",
              },
            },
          },
        },
      },
      print: {
        options: {
          param: {
            type: "multiple",
          },
        },
      },
      info: {
        options: {
          param: {
            type: "multiple",
          },
        },
      },
      logs: {
        options: {
          param: {
            type: "multiple",
          },
        },
      },
    };
    this.configurationVariablesSources = {
      parameter: {
        async resolve({ address, options }) {
          const params = {};
          for (const flag of options.param ?? []) {
            const [key, value] = flag.split("=");
            params[key] = value;
          }

          if (params?.[address] === undefined) {
            throw new Error(`Unknown parameter ${address}`);
          }

          return {
            value: params[address],
          };
        },
      },
    };
  }
}

module.exports = ParamPlugin;
