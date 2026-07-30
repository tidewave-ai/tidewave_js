import type { TidewaveConfig } from '../../core';
import { tidewaveConfig, type LocalRequestInfoGetter } from '../../config';
import type { TidewaveHandler, TidewaveNext, TidewaveRequest, TidewaveResponse } from '../types';

export {
  tidewaveConfig,
  type LocalRequestInfo,
  type LocalRequestInfoGetter,
  type TidewaveConfigPayload,
} from '../../config';

export function createHandleConfig(
  config: TidewaveConfig,
  getLocalRequestInfo?: LocalRequestInfoGetter<TidewaveRequest>,
): TidewaveHandler {
  return async function handleConfig(
    req: TidewaveRequest,
    res: TidewaveResponse,
    next: TidewaveNext,
  ): Promise<void> {
    try {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify(tidewaveConfig(config, getLocalRequestInfo, req)));
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
