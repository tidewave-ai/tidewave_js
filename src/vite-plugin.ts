import { type TidewaveConfig, configureServer } from './http';
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

  server.middlewares = configureServer(server.middlewares, config);
}
