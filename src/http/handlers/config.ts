import type { Request, Response, NextFn, Handler } from '../index';
import type { TidewaveConfig } from '../../core';
import { default as tidewavePackage } from '../../../package.json' with { type: 'json' };

export function createHandleConfig(config: TidewaveConfig): Handler {
  return async function handleConfig(_req: Request, res: Response, next: NextFn): Promise<void> {
    try {
      const tidewaveConfig = {
        project_name: config.projectName || 'app',
        framework_type: config.framework || 'unknown',
        tidewave_version: tidewavePackage.version,
        team: config.team || {},
      };

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
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
