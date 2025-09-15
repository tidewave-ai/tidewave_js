#!/usr/bin/env node
// src/cli/index.ts

import { program } from 'commander';
import chalk from 'chalk';
import { tools } from '../tools';
import { Tidewave } from '../index';
import { isExtractError, isResolveError } from '../core';

import { name, version } from '../../package.json';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { serveMcp } from '../mcp';

function chdir(path: string): void {
  try {
    process.chdir(path);
  } catch (e) {
    console.error(chalk.red(`Failed to apply given prefix: ${e}`));
  }
}

// CLI Interface
program
  .name(name)
  .description('Universal documentation and source extraction tool for TypeScript and JavaScript')
  .version(version);

async function handleGetDocs(
  modulePath: string,
  options: { prefix?: string; json?: boolean },
): Promise<void> {
  if (options.prefix) chdir(options.prefix);
  const docsResult = await Tidewave.extractDocs(modulePath);

  if (isExtractError(docsResult)) {
    console.error(chalk.red(`Error: ${docsResult.error.message}`));
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(docsResult, null, 2));
  } else {
    console.log(Tidewave.formatOutput(docsResult));
  }
}

async function handleGetSourcePath(
  moduleName: string,
  options: { prefix?: string },
): Promise<void> {
  if (options.prefix) chdir(options.prefix);

  const sourceResult = await Tidewave.getSourceLocation(moduleName);

  if (isResolveError(sourceResult)) {
    console.error(chalk.red(`Error: ${sourceResult.error.message}`));
    process.exit(1);
  }

  console.log(sourceResult.path);
}

interface McpOptions {
  prefix?: string;
}

async function handleMcp(options: McpOptions): Promise<void> {
  if (options.prefix) chdir(options.prefix);

  console.log('[Tidewave] Starting MCP server');

  const transport = new StdioServerTransport(process.stdin, process.stdout);
  await serveMcp(transport);
}

const {
  docs: { cli: docsCli },
  source: { cli: sourceCli },
} = tools;

program
  .command('mcp')
  .description('Starts a MCP server for tidewave (stdio)')
  .option(docsCli.options.prefix!.flag, docsCli.options.prefix!.desc)
  .action(handleMcp);

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
