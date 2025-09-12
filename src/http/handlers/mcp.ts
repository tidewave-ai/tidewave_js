import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { methodNotAllowed, type Request, type Response, type NextFn } from '..';
import { serveMcp } from '../../mcp';

export async function handleMcp(req: Request, res: Response, next: NextFn): Promise<void> {
  try {
    if (req.method !== 'POST') {
      methodNotAllowed(res);
      return;
    }

    console.debug(`[Tidewave] Received ${req.method} message`);

    // stateless mode, no session managament
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    if (!(req.body || res.headersSent)) {
      mcpErrorResponse(res, 'Request body was not parsed');
      return;
    }

    await serveMcp(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error(`[Tidewave] Failed to serve MCP with ${e}`);

    if (!res.headersSent) {
      mcpErrorResponse(res, e);
    }

    next(e);
  }
}

function mcpErrorResponse(res: Response, err: Error | unknown): void {
  res.statusCode = 500;
  res.setHeader('content-type', 'application/json');
  res.end(
    JSON.stringify({
      jsonrpc: 2.0,
      id: null,
      error: {
        code: -32603,
        message: 'Internal server error',
        data: err instanceof Error ? err.message : String(err),
      },
    }),
  );
}
