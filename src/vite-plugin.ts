import { checkOrigin, checkRemoteIp } from './http/security';
import { type Request, type Response, type NextFn, type TidewaveConfig, endpoint } from './http';
import { handleShell } from './http/handlers/shell';
import { handleMcp } from './http/handlers/mcp';
import type { Plugin, ViteDevServer } from 'vite';

export default function tidewave(
  config: TidewaveConfig = { port: 5173, host: 'localhost' },
): Plugin {
  return {
    name: 'vite-plugin-tidewave',
    configureServer: server => tidewaveServer(server, config),
  };
}

function tidewaveServer(server: ViteDevServer, config: TidewaveConfig): void {
  const { config: serverConfig } = server;
  const { host, port } = serverConfig.server;

  if (port) {
    config.port = port;
  }

  if (typeof host === 'string') {
    config.host = host;
  }

  if (!(config.host || config.port)) {
    console.error(
      `[Tidewave] should have both host and port configured, got: host: ${host} port: ${port}`,
    );
    return;
  }

  const middleware = (req: Request, res: Response, next: NextFn): void => {
    if (!checkRemoteIp(req, res, config)) return;
    if (!checkOrigin(req, res, config)) return;
    next();
  };

  server.middlewares.use(`${endpoint}/*`, middleware);
  server.middlewares.use(`${endpoint}/mcp`, handleMcp);
  server.middlewares.use(`${endpoint}/shell`, handleShell);
}
