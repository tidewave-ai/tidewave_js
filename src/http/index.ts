import { checkRemoteIp } from './security';
import { createHandleMcp } from './handlers/mcp';
import { createHandleControlHtml, createHandleHtml } from './handlers/html';
import { createHandleConfig } from './handlers/config';
import { createHandleUpload } from './handlers/upload';
import { createHandleResponseHeaders } from './headers';
import bodyParser from 'body-parser';
import type { TidewaveConfig } from '../core';
import type { LocalRequestInfoGetter } from '../config';
import { ENDPOINT } from './constants';
import type {
  TidewaveMiddlewareServer,
  TidewaveNext,
  TidewaveRequest,
  TidewaveResponse,
} from './types';

const DEFAULT_OPTIONS: TidewaveConfig = {
  allowRemoteAccess: false,
} as const;

export interface HandlerOptions {
  getLocalRequestInfo?: LocalRequestInfoGetter<TidewaveRequest>;
}

export function configureServer(
  server: TidewaveMiddlewareServer,
  config: TidewaveConfig = DEFAULT_OPTIONS,
  options: HandlerOptions = {},
): TidewaveMiddlewareServer {
  const securityChecker = checkSecurity(config);

  server.use(createHandleResponseHeaders(config, options.getLocalRequestInfo));
  server.use(`${ENDPOINT}`, securityChecker);
  server.use(`${ENDPOINT}/`, createHandleHtml(config));
  server.use(`${ENDPOINT}/connect`, createHandleControlHtml(config, options.getLocalRequestInfo));
  server.use(`${ENDPOINT}/config`, createHandleConfig(config, options.getLocalRequestInfo));
  server.use(`${ENDPOINT}/upload`, createHandleUpload(config));
  server.use(`${ENDPOINT}/mcp`, bodyParser.json());
  server.use(`${ENDPOINT}/mcp`, createHandleMcp(config, options));

  return server;
}

function checkSecurity(config: TidewaveConfig) {
  return (req: TidewaveRequest, res: TidewaveResponse, next: TidewaveNext): void => {
    if (!checkRemoteIp(req, res, config)) return;
    next();
  };
}
