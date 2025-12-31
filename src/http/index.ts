import type { ServerResponse } from 'http';
import type { IncomingMessage, NextFunction, Server } from 'connect';
import connect from 'connect';
import http from 'node:http';
import { checkOrigin, checkRemoteIp } from './security';
import { handleMcp } from './handlers/mcp';
import { createHandleHtml } from './handlers/html';
import { createHandleConfig } from './handlers/config';
import bodyParser from 'body-parser';
import type { TidewaveConfig } from '../core';

export interface Request extends IncomingMessage {
  body?: Record<string, unknown>;
}
export type Response = ServerResponse<IncomingMessage>;
export type NextFn = NextFunction;

export const ENDPOINT = '/tidewave' as const;
const DEFAULT_PORT = 5001 as const;
const DEFAULT_OPTIONS: TidewaveConfig = {
  allowRemoteAccess: false,
  allowedOrigins: [],
  port: 5001,
  host: 'localhost',
} as const;

export type Handler = (req: Request, res: Response, next: NextFn) => Promise<void>;

function getHandlers(config: TidewaveConfig): Record<string, Handler> {
  return {
    '': createHandleHtml(config),
    config: createHandleConfig(config),
    mcp: handleMcp,
  };
}

export function configureServer(
  server: Server = connect(),
  config: TidewaveConfig = DEFAULT_OPTIONS,
): Server {
  const securityChecker = checkSecurity(config);

  server.use(`${ENDPOINT}`, securityChecker);
  server.use(`${ENDPOINT}`, bodyParser.json());

  const handlers = getHandlers(config);
  for (const [path, handler] of Object.entries(handlers)) {
    server.use(ENDPOINT + '/' + path, handler);
  }

  return server;
}

export function serve(server: Server, config: TidewaveConfig = DEFAULT_OPTIONS): void {
  http.createServer(server).listen(config.port || DEFAULT_PORT);
}

export function checkSecurity(config: TidewaveConfig) {
  return (req: Request, res: Response, next: NextFn): void => {
    if (!checkRemoteIp(req, res, config)) return;
    if (!checkOrigin(req, res, config)) return;
    next();
  };
}

export function methodNotAllowed(res: Response): void {
  res.statusCode = 405;
  res.setHeader('Allow', 'POST');
  res.end();
  return;
}

// Export for use by framework integrations
export { getHandlers };
