#!/usr/bin/env node
// src/cli/index.ts

import { program } from 'commander';
import chalk from 'chalk';
import { tools, getDocs, getSourcePath } from '../tools';
import { TidewaveExtractor } from '../index';
import { isExtractError, isResolveError } from '../core';

import { name, version } from '../../package.json';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { serveMcp } from '../mcp';

// CLI Interface
program
  .name(name)
  .description('Universal documentation and source extraction tool for TypeScript and JavaScript')
  .version(version);

async function handleGetDocs(
  modulePath: string,
  options: { config?: string; json?: boolean },
): Promise<void> {
  const docsResult = await getDocs(modulePath, { config: options.config });

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
  options: { config?: string },
): Promise<void> {
  const sourceResult = await getSourcePath(moduleName, { config: options.config });

  if (isResolveError(sourceResult)) {
    console.error(chalk.red(`Error: ${sourceResult.error.message}`));
    process.exit(1);
  }

  console.log(sourceResult.path);
}

const mcpTransport = {
  stdio: StdioServerTransport,
};

async function handleMcp({ transport }: { transport?: string }): Promise<void> {
  if (!transport || !(transport in mcpTransport)) {
    console.error(chalk.red(`Error: expected to receive a transport layer, one of: 'stdio'`));
    process.exit(1);
  }

  const layer = mcpTransport[transport as keyof typeof mcpTransport];
  console.error(`Starting tidewave MCP server using ${transport}`)
  serveMcp(new layer());
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

program
  .command('mcp')
  .description('Starts a MCP server given the transport layer and its options')
  .option('-t, --transport', 'Defines the transport layer of the MCP server', 'stdio')
  .action(handleMcp);

program.parse(process.argv);
