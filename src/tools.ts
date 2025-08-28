import { z } from 'zod';
import type { ExtractResult, ResolveResult } from './core';
import { TidewaveExtractor } from '.';

export type DocsInputSchema = z.infer<typeof docsInputSchema>;
export type SourceInputSchema = z.infer<typeof sourceInputSchema>;

export interface Tool<Schema> {
  mcp: {
    name: string;
    description: string;
    inputSchema: Schema;
  };
  cli: {
    command: string;
    description: string;
    argument: string;
    argumentDescription: string;
    options: Record<string, { flag: string; desc: string }>;
  };
}

export interface Tools {
  docs: Tool<typeof docsInputSchema>;
  source: Tool<typeof sourceInputSchema>;
}

const docsInputSchema = z.object({
  module_path: z.string()
    .describe(`Module path in format 'module:symbol[#method|.method]'. Supports local files, dependencies, and Node.js builtins.

          Examples:
          - src/types.ts:SymbolInfo (local file symbol)
          - lodash:isEmpty (dependency function)  
          - react:Component#render (instance method)
          - node:Math.max (builtin static method)`),
  config: z.string().optional().describe('Path to tsconfig.json file for TypeScript configuration'),
});

const sourceInputSchema = z.object({
  module: z
    .string()
    .describe(
      'Module name to resolve. Can be local files (src/utils, ./types.ts), dependencies (lodash, react), or relative paths (./src/components/Button).',
    ),
  config: z
    .string()
    .optional()
    .describe('Path to a custom tsconfig.json file for TypeScript configuration'),
});

export const tools: Tools = {
  docs: {
    mcp: {
      name: 'get_docs',
      description:
        'Extract TypeScript/JavaScript documentation and type information for symbols, classes, functions, and methods',
      inputSchema: docsInputSchema,
    },
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
    mcp: {
      name: 'get_source_path',
      description: 'Resolve and return the file system path for TypeScript/JavaScript modules',
      inputSchema: sourceInputSchema,
    },
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
