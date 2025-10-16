import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { tools } from './tools';
import { name, version } from '../package.json';

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type {
  DocsInputSchema,
  ProjectEvalInputSchema,
  SourceInputSchema,
  GetLogsInputSchema,
} from './tools';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { isExtractError, isResolveError } from './core';
import { Tidewave } from '.';
import { logExporter } from './logger/circular-buffer-exporter';

const {
  docs: { mcp: docsMcp },
  source: { mcp: sourceMcp },
  eval: { mcp: evalMcp },
  logs: { mcp: logsMcp },
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
    const logs = logExporter.getLogs({
      tail: args.tail,
      grep: args.grep,
      level: args.level,
      since: args.since,
    });

    const logLines = logs.map(log => {
      let line = `[${log.timestamp}] ${log.severityText}: ${log.body}`;

      if (log.traceId || log.spanId) {
        const traceInfo = [];
        if (log.traceId) traceInfo.push(`traceId=${log.traceId}`);
        if (log.spanId) traceInfo.push(`spanId=${log.spanId}`);
        line += ` (${traceInfo.join(', ')})`;
      }

      return line;
    });

    const output = logLines.join('\n');

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

  // Only register logs MCP if logging has been initialized
  // @ts-expect-error - Flag set in initializeLogging
  if (globalThis.__TIDEWAVE_LOGGING_INITIALIZED__) {
    server.registerTool(
      logsMcp.name,
      {
        description: logsMcp.description,
        inputSchema: logsMcp.inputSchema.shape,
      },
      handleGetLogs,
    );
  }

  await server.connect(transport);
}
