import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { tools } from './tools';
import { name, version } from '../package.json';

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type {
  BrowserEvalInputSchema,
  DocsInputSchema,
  GetLogsInputSchema,
  ProjectEvalInputSchema,
  SourceInputSchema,
} from './tools';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { isExtractError, isResolveError } from './core';
import { Tidewave } from '.';
import { tidewaveLogger } from './logger/tidewave-logger';
import { browserSessions, type BrowserSessionResult } from './control/browser-sessions';

const {
  docs: { mcp: docsMcp },
  source: { mcp: sourceMcp },
  eval: { mcp: evalMcp },
  logs: { mcp: logsMcp },
  browserEval: { mcp: browserEvalMcp },
} = tools;

export interface ServeMcpOptions {
  includeBrowserTools?: boolean;
  url?: string;
}

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

  // Handle both FileInfo and SymbolInfo
  // For SymbolInfo, check if documentation is available
  if ('documentation' in docs && !docs.documentation) {
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

async function handleBrowserEval(
  args: BrowserEvalInputSchema,
  options: ServeMcpOptions,
): Promise<CallToolResult> {
  const url = options.url || 'http://localhost:5173';

  if (typeof args.sid === 'string' && args.sid !== '') {
    return directBrowserResult(
      await browserSessions().run(args.sid, 'browser_eval', args, evalTimeout(args)),
      args.sid,
      url,
    );
  }

  if (args.code === '' || !('code' in args) || args.code === undefined) {
    return broadcastBrowserResult(await broadcastBrowserEval(args), url);
  }

  return toolError('browser_eval requires a `sid` when `code` is not empty.');
}

async function broadcastBrowserEval(args: BrowserEvalInputSchema): Promise<BrowserSessionResult> {
  const first = await browserSessions().broadcastRun('browser_eval', args, 5_000);
  if (!first.ok && first.reason === 'timeout') {
    return browserSessions().broadcastRun('browser_eval', args, 5_000);
  }

  return first;
}

function directBrowserResult(
  result: BrowserSessionResult,
  sid: string,
  url: string,
): CallToolResult {
  if (result.ok) return result.result;

  switch (result.reason) {
    case 'invalid_sid':
      return toolError(`Invalid sid "${sid}". A sid looks like "nice-cactus#1".`);
    case 'unknown_client':
      return toolError(
        `No connected browser owns sid "${sid}". It may have disconnected - call browser_eval with no arguments to discover a live session.`,
      );
    case 'timeout':
      return toolError('browser_eval timed out waiting for the browser to respond.');
    case 'disconnected':
      return toolError(
        `The browser disconnected before responding. Open ${url}/tidewave in your browser to open a new session.`,
      );
    case 'no_clients':
      return toolError(noBrowserMessage(url));
  }
}

function broadcastBrowserResult(result: BrowserSessionResult, url: string): CallToolResult {
  if (result.ok) return result.result;
  return toolError(noBrowserMessage(url));
}

function noBrowserMessage(url: string): string {
  return `No browser is connected to the Tidewave control page. Open ${url}/tidewave in your browser and try again.`;
}

function toolError(text: string): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    isError: true,
  };
}

function evalTimeout(args: BrowserEvalInputSchema): number {
  const { timeout } = args;
  if (typeof timeout === 'number' && Number.isFinite(timeout) && timeout > 0) {
    return Math.min(timeout + 5_000, 60_000);
  }

  return 15_000;
}

export async function serveMcp(transport: Transport, options: ServeMcpOptions = {}): Promise<void> {
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

  if (options.includeBrowserTools) {
    server.registerTool(
      browserEvalMcp.name,
      {
        description: browserEvalMcp.description,
        inputSchema: browserEvalMcp.inputSchema.shape,
      },
      args => handleBrowserEval(args, options),
    );
  }

  await server.connect(transport);
}
