import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { serveMcp, type ServeMcpOptions } from '../../mcp';
import type { TidewaveConfig } from '../../core';
import type { LocalRequestInfoGetter } from '../../config';
import type { TidewaveNext, TidewaveRequest, TidewaveResponse } from '../types';

export interface McpHandlerOptions {
  getLocalRequestInfo?: LocalRequestInfoGetter<TidewaveRequest>;
}

export function createHandleMcp(
  config: TidewaveConfig = {},
  options: McpHandlerOptions = {},
): typeof handleMcp {
  return (req, res, next) => handleMcp(req, res, next, { config, ...options });
}

export async function handleMcp(
  req: TidewaveRequest,
  res: TidewaveResponse,
  next: TidewaveNext,
  options: McpHandlerOptions & { config?: TidewaveConfig } = {},
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

    await serveMcp(transport, serveOptions(req, options));
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error(`[Tidewave] Failed to serve MCP with ${e}`);

    if (!res.headersSent) {
      mcpErrorResponse(res, e);
    }

    next(e);
  }
}

function serveOptions(
  req: TidewaveRequest,
  options: McpHandlerOptions & { config?: TidewaveConfig },
): ServeMcpOptions {
  return {
    includeBrowserTools: includeBrowserTools(req),
    url: localOrigin(req, options.config || {}, options.getLocalRequestInfo),
  };
}

function includeBrowserTools(req: TidewaveRequest): boolean {
  try {
    return (
      new URL(req.url || '/', 'http://localhost').searchParams.get('include_browser_tools') !==
      'false'
    );
  } catch {
    return false;
  }
}

function localOrigin(
  req: TidewaveRequest,
  config: TidewaveConfig,
  getLocalRequestInfo?: LocalRequestInfoGetter<TidewaveRequest>,
): string {
  const localRequestInfo = getLocalRequestInfo?.(req);
  const host = firstHeaderValue(req.headers.host) || configuredHost(config, localRequestInfo?.port);
  const scheme = localRequestInfo?.scheme || 'http';
  return `${scheme}://${host}`;
}

function configuredHost(config: TidewaveConfig, localPort?: number): string {
  const host = config.host || 'localhost';
  const port = localPort || config.port;
  return port ? `${host}:${port}` : host;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
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
