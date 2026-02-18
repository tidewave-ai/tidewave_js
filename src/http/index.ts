import type { ServerResponse } from 'http';
import type { IncomingMessage, NextFunction, Server } from 'connect';
import connect from 'connect';
import { checkRemoteIp } from './security';
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
const DEFAULT_OPTIONS: TidewaveConfig = {
  allowRemoteAccess: false,
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

export function checkSecurity(config: TidewaveConfig) {
  return (req: Request, res: Response, next: NextFn): void => {
    if (!checkRemoteIp(req, res, config)) return;
    next();
  };
}

export function methodNotAllowed(res: Response): void {
  res.statusCode = 405;
  res.setHeader('Allow', 'POST');
  res.end();
}

export function originNotAllowed(res: Response): void {
  const message =
    'For security reasons, Tidewave does not accept requests with an origin header for this endpoint.';
  console.warn(message);
  res.statusCode = 403;
  res.end(message);
}

// Export for use by framework integrations
export { getHandlers };
