import type { TidewaveConfig } from './core';
import { configureServer } from './http';
import { getProjectName } from './core';
import type { Plugin, ViteDevServer } from 'vite';
// Import instrumentation to automatically patch console
import './logger/instrumentation';

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

async function tidewaveServer(
  server: ViteDevServer,
  config: TidewaveConfig = DEFAULT_CONFIG,
): Promise<void> {
  const { config: serverConfig } = server;
  const { host, port } = serverConfig.server;

  if (port) {
    config.port = port;
  }

  if (typeof host === 'string') {
    config.host = host;
  } else if (host === undefined) {
    // The host can be undefined, in which case the default is localhost,
    // see https://vite.dev/config/server-options#server-host.
    config.host = 'localhost';
  }

  if (!(config.host || config.port)) {
    console.error(
      `[Tidewave] should have both host and port configured, got: host: ${host} port: ${port}`,
    );
    return;
  }

  // Set framework and projectName upfront
  config.framework = 'vite';
  config.projectName = config.projectName || (await getProjectName('vite_app'));

  configureServer(server.middlewares, config);
}
