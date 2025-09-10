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
    if (req.method === 'GET') {
      res.statusCode = 405;
      res.end();
      next();
    }

    console.log(`Received ${req.method} message`);

    // stateless mode, no session managament
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await serveMcp(transport);
  } catch (e) {
    console.error(`Failed to server MCP with ${e}`);
    next(e);
  }
}
