import type { TidewaveConfig } from './core';
import { configureServer } from './http';
import { getProjectName } from './core';
import type { Plugin, ViteDevServer } from 'vite';
import { patchConsole } from './logger/console-patch';

patchConsole();

const DEFAULT_CONFIG: TidewaveConfig = {
  allowRemoteAccess: false,
} as const;

export default function tidewave(config: TidewaveConfig = {}): Plugin {
  return {
    name: 'vite-plugin-tidewave',
    configureServer: server => tidewaveServer(server, config),
  };
}

async function tidewaveServer(
  server: ViteDevServer,
  config: TidewaveConfig = DEFAULT_CONFIG,
): Promise<void> {
  // Set framework and projectName upfront
  config.framework = 'vite';
  config.projectName = config.projectName || (await getProjectName('vite_app'));

  configureServer(server.middlewares, config);
}
