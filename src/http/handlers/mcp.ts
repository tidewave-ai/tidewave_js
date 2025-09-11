import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { decodeBody, methodNotAllowed, type Request, type Response, type NextFn } from '..';
import { serveMcp } from '../../mcp';

export async function handleMcp(req: Request, res: Response, next: NextFn): Promise<void> {
  try {
    if (req.method !== 'POST') {
      methodNotAllowed(res);
      return;
    }

    console.log(`Received ${req.method} message`);

    // stateless mode, no session managament
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    const body = await decodeBody(req);
    await serveMcp(transport);
    await transport.handleRequest(req, res, body);
  } catch (e) {
    console.error(`Failed to serve MCP with ${e}`);

    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          jsonrpc: 2.0,
          id: null,
          error: {
            code: -32603,
            message: 'Internal server error',
            data: e instanceof Error ? e.message : String(e),
          },
        }),
      );
    }

    next(e);
  }
}
