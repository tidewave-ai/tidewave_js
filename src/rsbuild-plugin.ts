import type { TidewaveConfig } from './core';
import type { Server } from 'connect';
import { configureServer } from './http';
import { getProjectName } from './core';
import { patchConsole } from './logger/console-patch';
import connect from 'connect';

patchConsole();

const DEFAULT_CONFIG: TidewaveConfig = {
  allowRemoteAccess: false,
} as const;

interface RsbuildPlugin {
  name: string;
  apply: 'serve';
  setup: (api: {
    modifyRsbuildConfig: (fn: (config: Record<string, Record<string, unknown>>) => void) => void;
  }) => void;
}

interface Middlewares {
  unshift: (...handlers: Server[]) => void;
}

export default function tidewave(config: TidewaveConfig = {}): RsbuildPlugin {
  return {
    name: 'rsbuild-plugin-tidewave',
    apply: 'serve',
    setup(api): void {
      api.modifyRsbuildConfig(rsbuildConfig => {
        rsbuildConfig.dev ??= {};

        const existingSetup = rsbuildConfig.dev.setupMiddlewares;

        rsbuildConfig.dev.setupMiddlewares = [
          ...(Array.isArray(existingSetup) ? existingSetup : existingSetup ? [existingSetup] : []),

          (middlewares: Middlewares): void => {
            const app = connect();
            middlewares.unshift(app);

            // configureServer is sync — only getProjectName is async
            getProjectName('rsbuild_app').then(projectName => {
              const resolvedConfig: TidewaveConfig = {
                ...DEFAULT_CONFIG,
                ...config,
                framework: 'rsbuild',
                projectName: config.projectName || projectName,
              };
              configureServer(app, resolvedConfig);
            });
          },
        ];
      });
    },
  };
}
