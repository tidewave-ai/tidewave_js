import type { TidewaveConfig } from '../../core';
import type { TidewaveHandler, TidewaveNext, TidewaveRequest, TidewaveResponse } from '../types';
import { default as tidewavePackage } from '../../../package.json' with { type: 'json' };

export type LocalPortGetter = () => number | undefined;

export function createHandleConfig(
  config: TidewaveConfig,
  getLocalPort?: LocalPortGetter,
): TidewaveHandler {
  return async function handleConfig(
    _req: TidewaveRequest,
    res: TidewaveResponse,
    next: TidewaveNext,
  ): Promise<void> {
    try {
      const tidewaveConfig = {
        project_name: config.projectName || 'app',
        framework_type: config.framework || 'unknown',
        tidewave_version: tidewavePackage.version,
        team: config.team || {},
        local_port: getLocalPort?.(),
        tmp_dir: config.tmpDir || 'tmp',
      };

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify(tidewaveConfig));
    } catch (err) {
      console.error(`[Tidewave] Failed to serve config: ${err}`);

      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            error: 'Internal server error',
            message: err instanceof Error ? err.message : String(err),
          }),
        );
      }

      next(err);
    }
  };
}
