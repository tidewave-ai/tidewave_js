import { type Request, type Response, type NextFn, type Handler } from '../index';
import type { TidewaveConfig } from '../../core';
import { default as tidewavePackage } from '../../../package.json' with { type: 'json' };

export type LocalPortGetter = (req: Request) => number | undefined;

export function createHandleConfig(
  config: TidewaveConfig,
  getLocalPort?: LocalPortGetter,
): Handler {
  return async function handleConfig(req: Request, res: Response, next: NextFn): Promise<void> {
    try {
      const tidewaveConfig = {
        project_name: config.projectName || 'app',
        framework_type: config.framework || 'unknown',
        tidewave_version: tidewavePackage.version,
        team: config.team || {},
        local_port: getLocalPort?.(req),
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
