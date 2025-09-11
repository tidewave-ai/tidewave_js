import type { ViteDevServer, Plugin, Connect } from 'vite';
import { serveMcp } from './mcp';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { ServerResponse } from 'http';

const endpoint = '/tidewave' as const;

export function tidewave(): Plugin {
  return {
    name: 'vite-plugin-tidewave',
    configureServer: tidewaveServer,
  };
}

function tidewaveServer(server: ViteDevServer): void {
  server.middlewares.use(`${endpoint}/mcp`, handleMcp);
  // TODO: implement handleShell
  // server.middlewares.use(`${endpoint}/shell`, handleShell);
}

type Request = Connect.IncomingMessage;
type Response = ServerResponse<Connect.IncomingMessage>;
type NextFn = Connect.NextFunction;

async function handleMcp(req: Request, res: Response, next: NextFn): Promise<void> {
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

function methodNotAllowed(res: Response): void {
  res.statusCode = 405;
  res.setHeader('Allow', 'POST');
  res.end();
  return;
}

function decodeBody(req: Request): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body: string = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        console.error(`Failed to parse body: ${e}`);
        reject(e);
      }
    });
  });
}
