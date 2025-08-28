import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { tools, getDocs, getSourcePath } from './tools';
import { name, version } from '../package.json';

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { DocsInputSchema, SourceInputSchema } from './tools';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const {
  docs: { mcp: docsMcp },
  source: { mcp: sourceMcp },
} = tools;

async function handleGetDocs({ module_path, config }: DocsInputSchema): Promise<CallToolResult> {
  try {
    const docs = await getDocs(module_path, { config: config });
    return {
      content: [{ type: 'text', text: JSON.stringify(docs, null, 2) }],
      isError: false,
    };
  } catch (error) {
    return {
      content: [
        { type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` },
      ],
      isError: true,
    };
  }
}

// async function handleGetSourcePath(args:SourceInputSchema): Promise<CallToolResult> {
// }

export async function connect(transport: Transport): Promise<void> {
  const server = new McpServer({ name, version });

  server.registerTool(
    docsMcp.name,
    {
      description: docsMcp.description,
      inputSchema: docsMcp.inputSchema as any,
    },
    handleGetDocs,
  );

  // server.registerTool(sourceMcp.name, {
  //   description: sourceMcp.description,
  //   inputSchema: sourceMcp.inputSchema,
  // });

  server.connect(transport);
}
