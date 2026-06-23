import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { serveMcp } from '../../mcp';
import type { TidewaveNext, TidewaveRequest, TidewaveResponse } from '../types';

export async function handleMcp(
  req: TidewaveRequest,
  res: TidewaveResponse,
  next: TidewaveNext,
): Promise<void> {
  try {
    if (req.headers.origin) {
      originNotAllowed(res);
      return;
    }

    if (req.method !== 'POST') {
      methodNotAllowed(res);
      return;
    }

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

function mcpErrorResponse(res: TidewaveResponse, err: Error | unknown): void {
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

function methodNotAllowed(res: TidewaveResponse): void {
  res.statusCode = 405;
  res.setHeader('Allow', 'POST');
  res.end();
}

function originNotAllowed(res: TidewaveResponse): void {
  const message =
    'For security reasons, Tidewave does not accept requests with an origin header for this endpoint.';
  console.warn(message);
  res.statusCode = 403;
  res.end(message);
}
