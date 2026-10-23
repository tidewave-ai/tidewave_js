import type { TidewaveConfig } from './core';
import { configureServer } from './http';
import { getProjectName } from './core';
import type { Plugin, ViteDevServer } from 'vite';
import { patchConsole } from './logger/console-patch';
import { installControlWebSocket } from './control/websocket';
import type { LocalRequestInfoGetter, LocalScheme } from './config';
import type { TidewaveRequest } from './http/types';
import { createViteEvaluator, type ViteEvaluator } from './evaluation/vite';

patchConsole();

const DEFAULT_CONFIG: TidewaveConfig = {
  port: 5173,
  host: 'localhost',
  allowRemoteAccess: false,
  toolbar: true,
} as const;

export default function tidewave(
  config: TidewaveConfig = { port: 5173, host: 'localhost' },
): Plugin {
  const evaluator = createViteEvaluator();

  return {
    name: 'vite-plugin-tidewave',
    apply: 'serve',
    config: () => evaluator.config(),
    resolveId(id): string | undefined {
      return evaluator.resolveId(id, this.environment.config.root);
    },
    load: id => evaluator.load(id),
    configureServer: server => tidewaveServer(server, evaluator, config),
  };
}

async function tidewaveServer(
  server: ViteDevServer,
  evaluator: ViteEvaluator,
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
  config.toolbar = config.toolbar ?? true;

  const fallbackLocalScheme: LocalScheme = serverConfig.server.https ? 'https' : 'http';
  const getLocalRequestInfo: LocalRequestInfoGetter<TidewaveRequest> = req => ({
    port: localPort(server),
    scheme: localScheme(req, fallbackLocalScheme),
  });

  evaluator.listen(server);
  configureServer(server.middlewares, config, {
    getLocalRequestInfo,
    evaluate: request => evaluator.evaluate(server, request),
  });
  installControlWebSocket(server.httpServer, config);
}

function localPort(server: ViteDevServer): number | undefined {
  const address = server.httpServer?.address();
  return typeof address === 'object' && address !== null ? address.port : undefined;
}

function localScheme(req: TidewaveRequest | undefined, fallback: LocalScheme): LocalScheme {
  return socketEncrypted(req) ? 'https' : fallback;
}

function socketEncrypted(req: TidewaveRequest | undefined): boolean {
  return Boolean(
    (req?.socket as (TidewaveRequest['socket'] & { encrypted?: boolean }) | undefined)?.encrypted,
  );
}
