import type { ServerResponse } from 'http';
import type { IncomingMessage, NextFunction, Server } from 'connect';
import connect from 'connect';
import http from 'node:http';
import { checkOrigin, checkRemoteIp } from './security';
import { handleMcp } from './handlers/mcp';
import { handleShell } from './handlers/shell';
import bodyParser from 'body-parser';

export interface Request extends IncomingMessage {
  body?: Record<string, unknown>;
}
export type Response = ServerResponse<IncomingMessage>;
export type NextFn = NextFunction;

export const endpoint = '/tidewave' as const;

export interface TidewaveConfig {
  allowRemoteAccess?: boolean;
  allowedOrigins?: string[];
  port?: number;
  host?: string;
}

export function configureServer(server: Server = connect(), config: TidewaveConfig): Server {
  const securityChecker = checkSecurity(config);

  server.use(`${endpoint}/*`, securityChecker);
  server.use(`${endpoint}/*`, bodyParser.json());
  server.use(`${endpoint}/mcp`, handleMcp);
  server.use(`${endpoint}/shell`, handleShell);

  return server;
}

export function serve(server: Server, config: TidewaveConfig): void {
  http.createServer(server).listen(config.port || 5000);
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
