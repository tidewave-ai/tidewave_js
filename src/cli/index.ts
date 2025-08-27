#!/usr/bin/env node
// src/cli/index.ts

import { program } from 'commander';
import chalk from 'chalk';
import { tools, getDocs, getSourcePath } from '../tools';
import { TidewaveExtractor } from '../index';

import { name, version } from '../../package.json';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// CLI Interface
program
  .name(name)
  .description('Universal documentation and source extraction tool for TypeScript and JavaScript')
  .version(version);

async function handleGetDocs(
  modulePath: string,
  options: { config?: string; json?: boolean },
): Promise<void> {
  try {
    const docs = await getDocs(modulePath, { config: options.config });

    if (!docs) process.exit(1);

    if (options.json) {
      console.log(JSON.stringify(docs, null, 2));
    } else {
      console.log(TidewaveExtractor.formatOutput(docs));
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

async function handleGetSourcePath(
  moduleName: string,
  options: { config?: string },
): Promise<void> {
  try {
    const sourcePath = await getSourcePath(moduleName, { config: options.config });

    if (sourcePath) {
      console.log(sourcePath);
    } else {
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}
const {
  docs: { cli: docsCli },
  source: { cli: sourceCli },
} = tools;

program
  .command(docsCli.command)
  .description(docsCli.description)
  .argument(docsCli.argument, docsCli.argumentDescription)
  .option(docsCli.options.config!.flag, docsCli.options.config!.desc)
  .option(docsCli.options.json!.flag, docsCli.options.json!.desc)
  .action(handleGetDocs);

program
  .command(sourceCli.command)
  .description(sourceCli.description)
  .argument(sourceCli.argument, sourceCli.argumentDescription)
  .option(sourceCli.options.config!.flag, sourceCli.options.config!.desc)

  .action(handleGetSourcePath);

program.parse(process.argv);
