#!/usr/bin/env node
// src/cli/index.ts

import { program } from 'commander';
import chalk from 'chalk';
import { tools } from '../tools';
import { TidewaveExtractor } from '../index';
import { isExtractError, isResolveError } from '../core';

import { name, version } from '../../package.json';

// CLI Interface
program
  .name(name)
  .description('Universal documentation and source extraction tool for TypeScript and JavaScript')
  .version(version);

async function handleGetDocs(
  modulePath: string,
  options: { prefix?: string; json?: boolean },
): Promise<void> {
  const docsResult = await TidewaveExtractor.extractDocs(modulePath, { prefix: options.prefix });

  if (isExtractError(docsResult)) {
    console.error(chalk.red(`Error: ${docsResult.error.message}`));
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(docsResult, null, 2));
  } else {
    console.log(TidewaveExtractor.formatOutput(docsResult));
  }
}

async function handleGetSourcePath(
  moduleName: string,
  options: { prefix?: string },
): Promise<void> {
  const sourceResult = await TidewaveExtractor.getSourcePath(moduleName, {
    prefix: options.prefix,
  });

  if (isResolveError(sourceResult)) {
    console.error(chalk.red(`Error: ${sourceResult.error.message}`));
    process.exit(1);
  }

  console.log(sourceResult.path);
}
const {
  docs: { cli: docsCli },
  source: { cli: sourceCli },
} = tools;

program
  .command(docsCli.command)
  .description(docsCli.description)
  .argument(docsCli.argument, docsCli.argumentDescription)
  .option(docsCli.options.prefix!.flag, docsCli.options.prefix!.desc)
  .option(docsCli.options.json!.flag, docsCli.options.json!.desc)
  .action(handleGetDocs);

program
  .command(sourceCli.command)
  .description(sourceCli.description)
  .argument(sourceCli.argument, sourceCli.argumentDescription)
  .option(sourceCli.options.prefix!.flag, sourceCli.options.prefix!.desc)

  .action(handleGetSourcePath);

program.parse(process.argv);
