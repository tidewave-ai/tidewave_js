#!/usr/bin/env node
// src/cli/index.ts

import { program } from 'commander';
import chalk from 'chalk';
import { TidewaveExtractor } from '../index';

// CLI Interface
program
  .name('tidewave')
  .description('Universal documentation and source extraction tool for TypeScript and JavaScript')
  .version('0.1.0');

program
  .command('docs')
  .description('Extract documentation for a symbol')
  .argument(
    '<module-path>',
    'Module path formats:\n' +
      '  - module:symbol         - Extract a top-level symbol\n' +
      '  - module:Class#method   - Extract an instance method\n' +
      '  - module:Class.method   - Extract a static method\n' +
      '  - node:Class#method     - Extract a global/builtin instance method\n' +
      '  - node:Class.method     - Extract a global/builtin static method\n' +
      '\n' +
      'Examples:\n' +
      '  - src/types.ts:SymbolInfo\n' +
      '  - ./utils:parseConfig\n' +
      '  - lodash:isEmpty\n' +
      '  - react:Component#render\n' +
      '  - Math:Math.max',
  )
  .option('-c, --config <path>', 'Path to tsconfig.json')
  .option('-j, --json', 'Output as JSON')
  .action(async (modulePath: string, options) => {
    try {
      const docs = await TidewaveExtractor.extractDocs(modulePath, {
        tsConfigPath: options.config,
      });

      if (docs) {
        if (options.json) {
          console.log(JSON.stringify(docs, null, 2));
        } else {
          console.log(TidewaveExtractor.formatOutput(docs));
        }
      } else {
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program
  .command('source')
  .description('Get the source file path for a module')
  .argument(
    '<module>',
    'Module name to resolve:\n' +
      '  - Local files: src/utils, ./types.ts, ../config\n' +
      '  - Dependencies: lodash, react, @types/node\n' +
      '  - Relative paths: ./src/components/Button',
  )
  .option('-c, --config <path>', 'Path to tsconfig.json')
  .action(async (moduleName: string, options) => {
    try {
      const sourcePath = await TidewaveExtractor.getSourcePath(moduleName, {
        tsConfigPath: options.config,
      });

      if (sourcePath) {
        console.log(sourcePath);
      } else {
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// Entry point
program.parse(process.argv);
