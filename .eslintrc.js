'use strict';

module.exports = {
  root: true,
  ignorePatterns: ['demo/*', '**/dist/*'],
  plugins: ['import', '@typescript-eslint'],
  extends: ['@serverless/eslint-config/node'],
  overrides: [
    // Rules specific for TypeScript
    {
      files: ['**/*.ts'],
      // We must use a different parser that supports TypeScript
      parser: '@typescript-eslint/parser',
      // Extra rules specific to TypeScript
      extends: [
        'plugin:import/recommended',
        'plugin:import/typescript',
        'plugin:@typescript-eslint/recommended',
      ],
      parserOptions: {
        project: 'tsconfig.json',
      },
    },
  ],
  rules: {
    // This pattern is used by the CDK
    'no-new': ['off'],
  },
};
