import { z } from 'zod';

export type DocsInputSchema = z.infer<typeof docsInputSchema>;
export type SourceInputSchema = z.infer<typeof sourceInputSchema>;
export type ProjectEvalInputSchema = z.infer<typeof projectEvalInputSchema>;
export type GetLogsInputSchema = z.infer<typeof getLogsInputSchema>;
export type ListExportsInputSchema = z.infer<typeof listExportsInputSchema>;

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
  eval: Omit<Tool<typeof projectEvalInputSchema>, 'cli'>;
  logs: Omit<Tool<typeof getLogsInputSchema>, 'cli'>;
  listExports: Tool<typeof listExportsInputSchema>;
}

const projectEvalDescription = `
Evaluates JavaScript/TypeScript code in the context of the project.

The current NodeJS version is: ${process.version}

Use this tool every time you need to evaluate JavaScript/TypeScript code,
including to test the behaviour of a function or to debug
something. The tool also returns anything written to standard
output. DO NOT use shell tools to evaluate JavaScript/TypeScript code.

Imports are allowed only as the form of dynamic imports with async/await, e.g.:
const path = await import('node:path');
`;

export const projectEvalInputSchema = z.object({
  code: z.string().describe('The JavaScript code to evaluate.'),
  arguments: z
    .array(z.unknown())
    .optional()
    .default([])
    .describe(
      'The arguments to pass to evaluation. They are available inside the evaluated code as `arguments`.',
    ),
  timeout: z
    .number()
    .optional()
    .default(30_000)
    .describe(
      'Optional. A timeout in milliseconds after which the execution stops if it did not finish yet.\nDefaults to 30000 (30 seconds).',
    ),
  json: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to return the result as JSON or not (string)'),
});

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
});

const sourceInputSchema = z.object({
  reference: z.string().describe(referenceDescription),
});

export const getLogsInputSchema = z.object({
  tail: z.number().describe('Number of log entries to return from the end'),
  grep: z.string().optional().describe('Filter logs with regex pattern (case insensitive)'),
  level: z
    .enum(['DEBUG', 'INFO', 'WARN', 'ERROR'])
    .optional()
    .describe('Filter by log severity level'),
  since: z.string().optional().describe('ISO 8601 timestamp - return logs after this time'),
});

export const listExportsInputSchema = z.object({
  module: z.string().describe(
    `Module path to list exports from. Supports local files, dependencies, and subpath exports.

Examples:
- @expo/ui/swift-ui (dependency subpath)
- lodash (dependency)
- ./src/utils.ts (local file)
- react (dependency)`,
  ),
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
  eval: {
    mcp: {
      inputSchema: projectEvalInputSchema,
      description: projectEvalDescription,
      name: 'project_eval',
    },
  },
  logs: {
    mcp: {
      name: 'get_logs',
      description:
        'Retrieve application logs for debugging. Returns logs excluding Tidewave internal logs. Supports filtering by level, time, and pattern matching.',
      inputSchema: getLogsInputSchema,
    },
  },
  listExports: {
    mcp: {
      name: 'list_exports',
      description:
        'List all exported symbols from a TypeScript/JavaScript module. Use this to discover available symbols before using get_docs to retrieve detailed documentation. Works for local files, npm dependencies, and subpath exports.',
      inputSchema: listExportsInputSchema,
    },
    cli: {
      command: 'exports',
      description: 'List all exports from a module',
      argument: '<module>',
      argumentDescription:
        'Module path to list exports from. Examples: @expo/ui/swift-ui, lodash, ./src/utils.ts',
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
} as const;
