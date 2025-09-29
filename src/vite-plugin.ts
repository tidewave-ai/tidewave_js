import { loadConfig, type TidewaveConfig } from './config-loader';
import { configureServer } from './http';
import type { Plugin, ViteDevServer } from 'vite';

const DEFAULT_CONFIG: TidewaveConfig = {
  port: 5173,
  host: 'localhost',
  allowRemoteAccess: false,
} as const;

export default function tidewave(
  config: TidewaveConfig = { port: 5173, host: 'localhost' },
): Plugin {
  return {
    name: 'vite-plugin-tidewave',
    configureServer: server => tidewaveServer(server, config),
  };
}

async function tidewaveServer(server: ViteDevServer, config?: TidewaveConfig): Promise<void> {
  const loadedConfig: TidewaveConfig = config || (await loadConfig(DEFAULT_CONFIG));
  const { config: serverConfig } = server;
  const { host, port } = serverConfig.server;

  if (port) {
    loadedConfig.port = port;
  }

  if (typeof host === 'string') {
    loadedConfig.host = host;
  }

  if (!(loadedConfig.host || loadedConfig.port)) {
    console.error(
      `[Tidewave] should have both host and port configured, got: host: ${host} port: ${port}`,
    );
    return;
  }

  server.middlewares = configureServer(server.middlewares, config);
}
