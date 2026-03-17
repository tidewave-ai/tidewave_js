import type { TidewaveConfig } from './core';
import { configureServer } from './http';
import { getProjectName } from './core';
import { patchConsole } from './logger/console-patch';
import connect from 'connect';

patchConsole();

const DEFAULT_CONFIG: TidewaveConfig = {
  allowRemoteAccess: false,
} as const;

export default function tidewave(config: TidewaveConfig = {}): {
  name: string;
  apply: 'serve';
  setup: (api: any) => void;
} {
  return {
    name: 'rsbuild-plugin-tidewave',
    apply: 'serve',
    setup(api) {
      api.modifyRsbuildConfig((rsbuildConfig: any) => {
        rsbuildConfig.dev ??= {};

        const existingSetup = rsbuildConfig.dev.setupMiddlewares;

        rsbuildConfig.dev.setupMiddlewares = [
          ...(Array.isArray(existingSetup)
            ? existingSetup
            : existingSetup
              ? [existingSetup]
              : []),

          (middlewares: { unshift: (...handlers: any[]) => void }) => {
            const app = connect();
            middlewares.unshift(app);

            // configureServer is sync — only getProjectName is async
            getProjectName('rsbuild_app').then(projectName => {
              config = {
                ...DEFAULT_CONFIG,
                ...config,
                framework: 'rsbuild',
                projectName: config.projectName || projectName,
              };
              configureServer(app, config);
            });
          },
        ];
      });
    },
  };
}
