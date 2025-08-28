import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { tools, getDocs, getSourcePath } from './tools';
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

const {
  docs: { mcp: docsMcp },
  source: { mcp: sourceMcp },
} = tools;

async function handleGetDocs(
  { module_path, config }: DocsInputSchema,
  _extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
): Promise<CallToolResult> {
  const docs = await getDocs(module_path, { config: config });
  const fallback = JSON.stringify(docs);

  if (isExtractError(docs)) {
    return {
      content: [{ type: 'text', text: fallback }],
      // yeah, i know...
      structuredContent: docs as unknown as { [k: string]: unknown },
      isError: true,
    };
  }

  return {
    content: [{ type: 'text', text: fallback }],
    structuredContent: docs as unknown as { [k: string]: unknown },
    isError: false,
  };
}

async function handleGetSourcePath({module, config}: SourceInputSchema): Promise<CallToolResult> {
// }

export async function serveMcp(transport: Transport): Promise<void> {
  const server = new McpServer({ name, version });

  server.registerTool(
    docsMcp.name,
    {
      description: docsMcp.description,
      inputSchema: docsMcp.inputSchema.shape,
      // mcp sdk doesnt accept ZodObject, only ZodRawShape
      // so no support for zod.unions
      // https://github.com/modelcontextprotocol/typescript-sdk/issues/588
      outputSchema: docsMcp.outputSchema as any,
    },
    handleGetDocs,
  );

  server.registerTool(sourceMcp.name, {
    description: sourceMcp.description,
    inputSchema: sourceMcp.inputSchema.shape,
    outputSchema: sourceMcp.outputSchema as any,
  }, handleGetSourcePath);

  server.connect(transport);
}
