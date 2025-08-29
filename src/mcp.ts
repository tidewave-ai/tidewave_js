import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { tools } from './tools';
import { name, version } from '../package.json';

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { DocsInputSchema, SourceInputSchema } from './tools';
import type {
  CallToolResult,
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { isExtractError } from './core';
import { TidewaveExtractor } from '.';

const {
  docs: { mcp: docsMcp },
  source: { mcp: sourceMcp },
} = tools;

async function handleGetDocs(
  { module_path, prefix }: DocsInputSchema,
  _extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
): Promise<CallToolResult> {
  const docs = await TidewaveExtractor.extractDocs(module_path, { prefix: prefix });
  const response = JSON.stringify(docs);

  if (isExtractError(docs)) {
    return {
      content: [{ type: 'text', text: response }],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text', text: response }],
    isError: false,
  };
}

// async function handleGetSourcePath({module, prefix}: SourceInputSchema): Promise<CallToolResult> {
// }

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

  // server.registerTool(sourceMcp.name, {
  //   description: sourceMcp.description,
  //   inputSchema: sourceMcp.inputSchema.shape,
  // }, handleGetSourcePath);

  server.connect(transport);
}
