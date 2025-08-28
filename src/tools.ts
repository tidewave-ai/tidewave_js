import type { ExtractResult, ResolveResult } from './core';
import { TidewaveExtractor } from '.';

export interface Tool {
  cli: {
    command: string;
    description: string;
    argument: string;
    argumentDescription: string;
    options: Record<string, { flag: string; desc: string }>;
  };
}

export interface Tools {
  docs: Tool;
  source: Tool;
}

export const tools: Tools = {
  docs: {
    cli: {
      command: 'docs',
      description: 'Extract documentation for a symbol',
      argument: '<module-path>',
      argumentDescription: `Module path formats:
        - module:symbol         - Extract a top-level symbol
        - module:Class#method   - Extract an instance method
        - module:Class.method   - Extract a static method
        - node:Class#method     - Extract a global/builtin instance method
        - node:Class.method     - Extract a global/builtin static method

      Examples:
        - src/types.ts:SymbolInfo
        - ./utils:parseConfig
        - lodash:isEmpty
        - react:Component#render
        - node:Math.max`,
      options: {
        config: {
          flag: '-c, --config <path>',
          desc: 'Path to a custom tsconfig.json',
        },
        json: {
          flag: '-j, --json',
          desc: 'If the output should be in JSON format or not',
        },
      },
    },
  },
  source: {
    cli: {
      command: 'source',
      description: 'Get the source file path for a module',
      argument: '<module>',
      argumentDescription: `Module name to resolve:
      - Local files: src/utils, ./types.ts, ../config
      - Dependencies: lodash, react, @types/node
      - Relative paths: ./src/components/Button`,
      options: {
        config: {
          flag: '-c, --config <path>',
          desc: 'Path to a custom tsconfig.json file for TypeScript',
        },
      },
    },
  },
} as const;

export async function getDocs(
  module: string,
  options: { config?: string },
): Promise<ExtractResult> {
  return await TidewaveExtractor.extractDocs(module, { tsConfigPath: options.config });
}

export async function getSourcePath(
  module: string,
  options: { config?: string },
): Promise<ResolveResult> {
  return await TidewaveExtractor.getSourcePath(module, {
    tsConfigPath: options.config,
  });
}
