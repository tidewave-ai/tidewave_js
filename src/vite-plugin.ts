import { checkOrigin, checkRemoteIp } from './http/security';
import type { Request, Response, NextFn } from './http';
import { handleShell } from './http/handlers/shell';
import { handleMcp } from './http/handlers/mcp';
import type { Plugin, ViteDevServer } from 'vite';

const endpoint = '/tidewave' as const;

export interface TidewaveConfig {
  allowRemoteAccess?: boolean;
  allowedOrigins?: string[];
}

export default function tidewave(config: TidewaveConfig = {}): Plugin {
  return {
    name: 'vite-plugin-tidewave',
    configureServer: server => tidewaveServer(server, config),
  };
}

function tidewaveServer(server: ViteDevServer, config: TidewaveConfig): void {
  const middleware = (req: Request, res: Response, next: NextFn): void => {
    if (!checkRemoteIp(req, res, config)) return;
    if (!checkOrigin(req, res, server, config)) return;
    next();
  };

  server.middlewares.use(`${endpoint}/*`, middleware);
  server.middlewares.use(`${endpoint}/mcp`, handleMcp);
  server.middlewares.use(`${endpoint}/shell`, handleShell);
}
