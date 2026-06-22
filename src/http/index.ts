import { checkRemoteIp } from './security';
import { handleMcp } from './handlers/mcp';
import { createHandleHtml } from './handlers/html';
import { createHandleConfig, type LocalPortGetter } from './handlers/config';
import bodyParser from 'body-parser';
import type { TidewaveConfig } from '../core';
import type {
  TidewaveMiddlewareServer,
  TidewaveNext,
  TidewaveRequest,
  TidewaveResponse,
} from './types';

export const ENDPOINT = '/tidewave' as const;
const DEFAULT_OPTIONS: TidewaveConfig = {
  allowRemoteAccess: false,
} as const;

export interface HandlerOptions {
  getLocalPort?: LocalPortGetter;
}

export function configureServer(
  server: TidewaveMiddlewareServer,
  config: TidewaveConfig = DEFAULT_OPTIONS,
  options: HandlerOptions = {},
): TidewaveMiddlewareServer {
  const securityChecker = checkSecurity(config);

  server.use(`${ENDPOINT}`, securityChecker);
  server.use(`${ENDPOINT}/`, createHandleHtml(config));
  server.use(`${ENDPOINT}/config`, createHandleConfig(config, options.getLocalPort));
  server.use(`${ENDPOINT}/mcp`, bodyParser.json());
  server.use(`${ENDPOINT}/mcp`, handleMcp);

  return server;
}

function checkSecurity(config: TidewaveConfig) {
  return (req: TidewaveRequest, res: TidewaveResponse, next: TidewaveNext): void => {
    if (!checkRemoteIp(req, res, config)) return;
    next();
  };
}
