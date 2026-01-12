import { z } from 'zod';

export type DocsInputSchema = z.infer<typeof docsInputSchema>;
export type SourceInputSchema = z.infer<typeof sourceInputSchema>;
export type ProjectEvalInputSchema = z.infer<typeof projectEvalInputSchema>;
export type GetLogsInputSchema = z.infer<typeof getLogsInputSchema>;

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

const referenceDescription = `Module/file path, optionally with symbol in format 'module[:symbol[#method|.method]]'. Supports local files, dependencies, and Node.js builtins.

Module reference format:
- module                - List all symbols in the module (file-level documentation)
- module:symbol         - Extract a top-level symbol
- module:Class#method   - Extract an instance method
- module:Class.method   - Extract a static method
- node:Class#method     - Extract a global/builtin instance method
- node:Class.method     - Extract a global/builtin static method

Examples:
- src/types.ts (list all symbols in file)
- lodash (list all symbols in dependency)
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

export const tools: Tools = {
  docs: {
    mcp: {
      name: 'get_docs',
      description: `Extract TypeScript/JavaScript documentation and type information. Works for modules in the current project, dependencies, and builtin node modules.

Reference format determines what is returned:

• "module" - Returns file overview and lists all exported symbols with their kinds, line numbers, and brief documentation. Use this to discover what's available in a module.

• "module:symbol" - Returns detailed documentation for a specific top-level symbol including its type signature, full documentation, JSDoc tags, and source location.

• "module:Class.staticMethod" - Returns detailed documentation for a static method or property of a class or object.

• "module:Class#instanceMethod" - Returns detailed documentation for an instance method or property of a class.

Examples:
- "src/types.ts" → Lists all exported symbols in the file
- "lodash" → Lists all symbols exported from lodash
- "src/types.ts:SymbolInfo" → Full docs for SymbolInfo interface
- "react:Component#render" → Docs for React Component's render method
- "node:Math.max" → Docs for Math.max static method

Start with module-only references to explore, then drill into specific symbols for detailed information.`,
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
} as const;
