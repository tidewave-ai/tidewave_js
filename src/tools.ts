import { z } from 'zod';

export type DocsInputSchema = z.infer<typeof docsInputSchema>;
export type SourceInputSchema = z.infer<typeof sourceInputSchema>;

export interface Tool<InputSchema> {
  mcp: {
    name: string;
    description: string;
    inputSchema: InputSchema;
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

const referenceDescription = `Module path in format 'module:symbol[#method|.method]'. Supports local files, dependencies, and Node.js builtins.

        Module reference format:
        - module:symbol         - Extract a top-level symbol
        - module:Class#method   - Extract an instance method
        - module:Class.method   - Extract a static method
        - node:Class#method     - Extract a global/builtin instance method
        - node:Class.method     - Extract a global/builtin static method

        Examples:
        - src/types.ts:SymbolInfo (local file symbol)
        - lodash:isEmpty (dependency function)  
        - react:Component#render (instance method)
        - node:Math.max (builtin static method)`;

export const docsInputSchema = z.object({
  reference: z.string().describe(referenceDescription),
  prefix: z
    .string()
    .optional()
    .describe('Path to a custom project path (which contains tsconfig.json/package.json)'),
});

const sourceInputSchema = z.object({
  reference: z.string().describe(referenceDescription),
  prefix: z
    .string()
    .optional()
    .describe('Path to a custom project path (which contains tsconfig.json/package.json)'),
});

export const tools: Tools = {
  docs: {
    mcp: {
      name: 'get_docs',
      description:
        'Extract TypeScript/JavaScript documentation and type information for symbols, classes, functions, and methods. This works for modules in the current project, as well as dependencies, and builtin node modules',
      inputSchema: docsInputSchema,
    },
    cli: {
      command: 'docs',
      description: 'Extract documentation for a symbol',
      argument: '<module-path>',
      argumentDescription: referenceDescription,
      options: {
        prefix: {
          flag: '-p, --prefix <path>',
          desc: 'Path to a custom project path (which contains tsconfig.json/package.json)',
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
      name: 'get_source_location',
      description:
        'Extract TypeScript/JavaScript source location for the given reference. This works for modules in the current project, as well as dependencies, and builtin node modules',
      inputSchema: sourceInputSchema,
    },
    cli: {
      command: 'source',
      description: 'Get the source file path for a module',
      argument: '<module>',
      argumentDescription: referenceDescription,
      options: {
        prefix: {
          flag: '-p, --prefix <path>',
          desc: 'Path to a custom project path (which contains tsconfig.json/package.json)',
        },
      },
    },
  },
} as const;
