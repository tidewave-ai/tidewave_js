import { z } from 'zod';
import type { ExtractResult, ResolveResult } from './core';
import { TidewaveExtractor } from '.';

export type DocsInputSchema = z.infer<typeof docsInputSchema>;
export type SourceInputSchema = z.infer<typeof sourceInputSchema>;

export type DocsOutputSchema = z.infer<typeof docsOutputSchema>;
export type SourceOutputSchema = z.infer<typeof sourceOutputSchema>;

export interface Tool<InputSchema, OutputSchema> {
  mcp: {
    name: string;
    description: string;
    inputSchema: InputSchema;
    outputSchema: OutputSchema;
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
  docs: Tool<typeof docsInputSchema, typeof docsOutputSchema>;
  source: Tool<typeof sourceInputSchema, typeof sourceOutputSchema>;
}

export const docsInputSchema = z.object({
  module_path: z.string()
    .describe(`Module path in format 'module:symbol[#method|.method]'. Supports local files, dependencies, and Node.js builtins.

          Examples:
          - src/types.ts:SymbolInfo (local file symbol)
          - lodash:isEmpty (dependency function)  
          - react:Component#render (instance method)
          - node:Math.max (builtin static method)`),
  config: z.string().optional().describe('Path to tsconfig.json file for TypeScript configuration'),
});

const docsOutputSchema = z
  .union([
    z
      .object({
        name: z
          .string()
          .describe(
            'The fully qualified name of the symbol, including member access (e.g., "Math.max", "Component#render")',
          ),
        kind: z
          .string()
          .describe(
            'The TypeScript symbol kind (e.g., "function", "class", "interface", "method", "property", "variable")',
          ),
        type: z
          .string()
          .describe('The TypeScript type signature of the symbol as a string representation'),
        documentation: z
          .string()
          .optional()
          .describe('TypeScript compiler-extracted documentation and comments for the symbol'),
        signature: z
          .string()
          .optional()
          .describe(
            'The full signature for functions/methods including parameters and return type',
          ),
        location: z
          .string()
          .describe(
            'The file path and line number where the symbol is defined (e.g., "src/utils.ts:42")',
          ),
        jsDoc: z
          .string()
          .optional()
          .describe(
            'JSDoc comments associated with the symbol, including tags like @param, @returns, @example',
          ),
      })
      .describe('Successfully extracted symbol information'),
    z
      .object({
        error: z
          .object({
            code: z
              .enum([
                'SYMBOL_NOT_FOUND',
                'PARSE_ERROR',
                'INVALID_REQUEST',
                'MODULE_NOT_FOUND',
                'MEMBER_NOT_FOUND',
                'TYPE_ERROR',
              ])
              .describe('Error code indicating the type of extraction failure'),
            message: z.string().describe('Human-readable error message explaining what went wrong'),
            details: z
              .unknown()
              .optional()
              .describe('Additional error context or debugging information'),
          })
          .describe('Error details when symbol extraction fails'),
      })
      .describe('Error response when documentation extraction fails'),
  ])
  .describe('Result of documentation extraction - either symbol information or an error');

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

const sourceOutputSchema = z
  .union([
    z
      .object({
        path: z
          .string()
          .describe('The resolved file system path to the module (absolute or relative to cwd)'),
        format: z
          .enum(['commonjs', 'module', 'typescript'])
          .describe(
            'The module format - "commonjs" for .js CJS files, "module" for .mjs ESM files, or "typescript" for .ts/.tsx files',
          ),
        content: z
          .string()
          .optional()
          .describe('Optional file content if pre-loaded during resolution'),
      })
      .describe('Successfully resolved module information'),
    z
      .object({
        success: z.literal(false).describe('Indicates resolution failure'),
        error: z
          .object({
            code: z
              .enum(['MODULE_NOT_FOUND', 'INVALID_SPECIFIER', 'RESOLUTION_FAILED'])
              .describe('Error code indicating the type of resolution failure'),
            message: z
              .string()
              .describe('Human-readable error message explaining why module resolution failed'),
            details: z
              .unknown()
              .optional()
              .describe('Additional error context or debugging information'),
          })
          .describe('Error details when module resolution fails'),
      })
      .describe('Error response when module resolution fails'),
  ])
  .describe('Result of module resolution - either resolved path information or an error');

export const tools: Tools = {
  docs: {
    mcp: {
      name: 'get_docs',
      description:
        'Extract TypeScript/JavaScript documentation and type information for symbols, classes, functions, and methods',
      inputSchema: docsInputSchema,
      outputSchema: docsOutputSchema,
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
      outputSchema: sourceOutputSchema,
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
