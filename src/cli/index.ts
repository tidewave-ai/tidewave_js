#!/usr/bin/env node
// src/cli/index.ts

import { program } from 'commander';
import chalk from 'chalk';
import { tools } from '../tools';
import { Tidewave } from '../index';
import { isExtractError, isResolveError, isListExportsError } from '../core';

import { name, version } from '../../package.json';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { serveMcp } from '../mcp';
import { handleInstall } from './install';

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

async function handleListExports(
  modulePath: string,
  options: { prefix?: string; json?: boolean },
): Promise<void> {
  if (options.prefix) chdir(options.prefix);

  const result = await Tidewave.listExports(modulePath);

  if (isListExportsError(result)) {
    console.error(chalk.red(`Error: ${result.error.message}`));
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(chalk.bold(`Exports from ${modulePath} (${result.exports.length} symbols):\n`));
    console.log(result.exports.join('\n'));
  }
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
  listExports: { cli: listExportsCli },
} = tools;

program
  .command('install')
  .description('Install Tidewave in a Next.js project')
  .option('--prefix <path>', 'Specify the directory containing package.json')
  .option('--dry-run', 'Preview changes without creating files')
  .action(handleInstall);

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

program
  .command(listExportsCli.command)
  .description(listExportsCli.description)
  .argument(listExportsCli.argument, listExportsCli.argumentDescription)
  .option(listExportsCli.options.prefix!.flag, listExportsCli.options.prefix!.desc)
  .option(listExportsCli.options.json!.flag, listExportsCli.options.json!.desc)
  .action(handleListExports);

program.parse(process.argv);
