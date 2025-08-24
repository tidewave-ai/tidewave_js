// src/cli/index.ts
import { program } from 'commander';
import chalk from 'chalk';
import { extractSymbol } from '../extraction/typescript';
import { isExtractError } from '../core/types';
import type { ExtractionRequest, SymbolInfo } from '../core/types';

// Parse module path (module:symbol#member or module:symbol.member)
const parseModulePath = (input: string): ExtractionRequest => {
  const [module, rest] = input.split(':');

  if (!rest) {
    return { module: module || '' };
  }

  // Check for instance member (#)
  if (rest.includes('#')) {
    const [symbol, member] = rest.split('#');
    return { module: module || '', symbol: symbol || '', member: member || '', isStatic: false };
  }

  // Check for static member (.)
  const lastDot = rest.lastIndexOf('.');
  if (lastDot > 0) {
    const symbol = rest.substring(0, lastDot);
    const member = rest.substring(lastDot + 1);
    return { module: module || '', symbol: symbol || '', member: member || '', isStatic: true };
  }

  return { module: module || '', symbol: rest || '' };
};

// Format output for display
const formatOutput = (info: SymbolInfo): string => {
  const lines: readonly string[] = [];

  lines.push(chalk.blue.bold(`\n${info.name}`));
  lines.push(chalk.gray(`Kind: ${info.kind}`));
  lines.push(chalk.gray(`Location: ${info.location}`));
  lines.push('');

  if (info.signature) {
    lines.push(chalk.green.bold('Signature:'));
    lines.push(chalk.cyan(info.signature));
    lines.push('');
  }

  if (info.documentation) {
    lines.push(chalk.green.bold('Documentation:'));
    lines.push(info.documentation);
    lines.push('');
  }

  if (info.jsDoc) {
    lines.push(chalk.green.bold('JSDoc Tags:'));
    lines.push(chalk.yellow(info.jsDoc));
    lines.push('');
  }

  lines.push(chalk.green.bold('Type:'));
  lines.push(chalk.magenta(info.type));

  return lines.join('\n');
};

// Main CLI setup
export const createCli = () => {
  program
    .name('tidewave')
    .description('Extract TypeScript/JavaScript documentation')
    .version('0.1.0');

  program
    .command('extract')
    .alias('e')
    .description('Extract symbol documentation')
    .argument('<module-path>', 'Module path (e.g., ./src/index:myFunction)')
    .option('-c, --config <path>', 'Path to tsconfig.json')
    .option('-j, --json', 'Output as JSON')
    .option('-r, --runtime <runtime>', 'Runtime (node, bun, deno)', 'node')
    .action(async (modulePath: string, options) => {
      try {
        const request = parseModulePath(modulePath);
        const result = await extractSymbol(request, {
          tsConfigPath: options.config,
          runtime: options.runtime,
        });

        if (isExtractError(result)) {
          console.error(chalk.red(`Error: ${result.error.message}`));
          if (result.error.details && options.verbose) {
            console.error(chalk.gray('Details:'), result.error.details);
          }
          process.exit(1);
        }

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatOutput(result));
        }
      } catch (error) {
        console.error(chalk.red('Unexpected error:'), error);
        process.exit(1);
      }
    });

  program
    .command('resolve')
    .alias('r')
    .description('Resolve module path')
    .argument('<module>', 'Module to resolve')
    .option('-s, --source <path>', 'Source file path', './index.ts')
    .action(async (module: string, options) => {
      const NodeResolver = await import('../resolution/node');
      const result = await NodeResolver.resolveModule({
        specifier: module,
        source: options.source,
      });

      if (isExtractError(result as any)) {
        console.error(chalk.red(`Error: ${(result as any).error.message}`));
        process.exit(1);
      }

      console.log(chalk.green('Resolved path:'), (result as any).path);
      console.log(chalk.gray('Format:'), (result as any).format);
    });

  return program;
};

// Entry point
if (require.main === module) {
  createCli().parse();
}
