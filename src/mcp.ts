import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { tools } from './tools';
import { name, version } from '../package.json';

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type {
  DocsInputSchema,
  ProjectEvalInputSchema,
  SourceInputSchema,
  GetLogsInputSchema,
  GetExportsInputSchema,
} from './tools';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { isExtractError, isResolveError, isExportsError } from './core';
import { Tidewave } from '.';
import { tidewaveLogger } from './logger/tidewave-logger';

const {
  docs: { mcp: docsMcp },
  source: { mcp: sourceMcp },
  eval: { mcp: evalMcp },
  logs: { mcp: logsMcp },
  getExports: { mcp: getExportsMcp },
} = tools;

async function handleProjectEvaluation({
  code,
  timeout,
  arguments: args,
  json,
}: ProjectEvalInputSchema): Promise<CallToolResult> {
  const result = await Tidewave.executeIsolated({ code, timeout, args });

  if (!result.success) {
    if (json)
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        isError: true,
      };

    return {
      content: [
        {
          type: 'text',
          text: `Failed to evaluate code. Process exited with reason: ${result.stderr}\n\n${result.result}`,
        },
      ],
      isError: true,
    };
  }

  if (json)
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      isError: false,
    };

  return {
    content: [
      {
        type: 'text',
        text: `Stdout:\n\n${result.stdout}\n\nStderr:${result.stderr}\n\nResult:${result.result}`,
      },
    ],
    isError: false,
  };
}

async function handleGetDocs({ reference }: DocsInputSchema): Promise<CallToolResult> {
  const docs = await Tidewave.extractDocs(reference);

  if (isExtractError(docs)) {
    return {
      content: [
        {
          type: 'text',
          text: `Documentation not found for ${reference}, got an error: ${JSON.stringify(docs)}`,
        },
      ],
      isError: true,
    };
  }

  if (!docs.documentation) {
    return {
      content: [
        {
          type: 'text',
          text: `Documentation not avaialble for ${reference}, reference did not include it`,
        },
      ],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text', text: Tidewave.formatOutput(docs) }],
    isError: false,
  };
}

async function handleGetSourcePath({ reference }: SourceInputSchema): Promise<CallToolResult> {
  const sourceResult = await Tidewave.getSourceLocation(reference);

  if (isResolveError(sourceResult)) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to get source location for ${reference}: ${JSON.stringify(sourceResult)}`,
        },
      ],
      isError: true,
    };
  }

  // TODO maybe we could include `content`
  // in the future for avoiding LLM roundtrip
  const { path, format } = sourceResult;

  return {
    content: [{ type: 'text', text: `${path}(${format})` }],
    isError: false,
  };
}

async function handleGetLogs(args: GetLogsInputSchema): Promise<CallToolResult> {
  try {
    const logs = await tidewaveLogger.getLogs({
      tail: args.tail,
      grep: args.grep,
      level: args.level,
      since: args.since,
    });

    const output = logs
      .map(log => `[${log.timestamp}] ${log.severityText}: ${log.body}`)
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
      isError: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error retrieving logs: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

async function handleGetExports({ module }: GetExportsInputSchema): Promise<CallToolResult> {
  const result = await Tidewave.getExports(module);

  if (isExportsError(result)) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to get exports for ${module}: ${result.error.message}`,
        },
      ],
      isError: true,
    };
  }

  const { exports } = result;
  const exportLines = exports.map(exp => `${exp.name} (line ${exp.line})`);
  const output = `Exports from ${module} (${exports.length} symbols):\n\n${exportLines.join('\n')}`;

  return {
    content: [{ type: 'text', text: output }],
    isError: false,
  };
}

export async function serveMcp(transport: Transport): Promise<void> {
  const server = new McpServer({ name, version });

  server.registerTool(
    docsMcp.name,
    {
      description: docsMcp.description,
      inputSchema: docsMcp.inputSchema.shape,
    },
    handleGetDocs,
  );

  server.registerTool(
    sourceMcp.name,
    {
      description: sourceMcp.description,
      inputSchema: sourceMcp.inputSchema.shape,
    },
    handleGetSourcePath,
  );

  server.registerTool(
    evalMcp.name,
    { description: evalMcp.description, inputSchema: evalMcp.inputSchema.shape },
    handleProjectEvaluation,
  );

  // Only register logs MCP if console has been patched
  // @ts-expect-error - Flag set when console is patched
  if (globalThis.__TIDEWAVE_CONSOLE_PATCHED__) {
    server.registerTool(
      logsMcp.name,
      {
        description: logsMcp.description,
        inputSchema: logsMcp.inputSchema.shape,
      },
      handleGetLogs,
    );
  }

  server.registerTool(
    getExportsMcp.name,
    {
      description: getExportsMcp.description,
      inputSchema: getExportsMcp.inputSchema.shape,
    },
    handleGetExports,
  );

  await server.connect(transport);
}
