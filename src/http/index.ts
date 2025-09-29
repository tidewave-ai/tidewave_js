import type { ServerResponse } from 'http';
import type { IncomingMessage, NextFunction, Server } from 'connect';
import connect from 'connect';
import http, { type OutgoingHttpHeader, type OutgoingHttpHeaders } from 'node:http';
import { checkOrigin, checkRemoteIp } from './security';
import { handleMcp } from './handlers/mcp';
import { handleShell } from './handlers/shell';
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

export function configureServer(
  server: Server = connect(),
  config: TidewaveConfig = DEFAULT_OPTIONS,
): Server {
  const securityChecker = checkSecurity(config);

  server.use(`${ENDPOINT}`, CSPMiddleware);
  server.use(`${ENDPOINT}`, logger);
  server.use(`${ENDPOINT}`, securityChecker);
  server.use(`${ENDPOINT}`, bodyParser.json());
  server.use(`${ENDPOINT}/mcp`, handleMcp);
  server.use(`${ENDPOINT}/shell`, handleShell);

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

export function logger(req: Request, _: Response, next: NextFn): void {
  console.log(`[${new Date().toTimeString()}] ${req.method} ${req.url}`);
  next();
}

type WriteHeadArgs =
  | [statusCode: number, headers?: OutgoingHttpHeaders | OutgoingHttpHeader[]]
  | [
      statusCode: number,
      reasonPhrase?: string,
      headers?: OutgoingHttpHeaders | OutgoingHttpHeader[],
    ];

export function CSPMiddleware(_: Request, res: Response, next: NextFn): void {
  // rewrite before send headers to client
  // nodejs responses are streams
  const originalwritehead = res.writeHead.bind(res);
  res.writeHead = function (...args: WriteHeadArgs): Response {
    maybeRewriteCSP(res);

    if (typeof args[1] !== 'string' && args[2] !== undefined) {
      return originalwritehead(args[0], args[1]);
    }

    return originalwritehead(args[0], args[1] as string | undefined, args[2]);
  };
  next();
}

export function maybeRewriteCSP(res: Response): void {
  try {
    if (res.writableEnded || res.headersSent) {
      return;
    }

    const csp = res.getHeader('content-security-policy');
    if (typeof csp === 'string' || Array.isArray(csp)) {
      const rewrittenCSP = rewriteCSP(csp);
      res.setHeader('content-security-policy', rewrittenCSP);
    }

    res.removeHeader('x-frame-options');
  } catch (err) {
    console.error(`[Tidewave] Failed to rewrite CSP header with: ${err}`);
  }
}

function rewriteCSP(cspHeader: string | string[]): string {
  const csp: string = Array.isArray(cspHeader) ? (cspHeader[0] ?? '') : cspHeader;

  return csp
    .split(';')
    .map(directive => directive.trim())
    .filter(directive => directive.length > 0)
    .map(directive => {
      const [policy, ...rest] = directive.split(/\s+/, 2);
      const directives = rest.join(' ');

      if (policy === 'frame-ancestors') return null;

      if (policy === 'script-src' && !directives.includes("'unsafe-eval'")) {
        return `${policy} 'unsafe-eval' ${directives}`;
      }

      return `${policy} ${directives}`;
    })
    .filter((d): d is string => d !== null)
    .join('; ');
}

export function methodNotAllowed(res: Response): void {
  res.statusCode = 405;
  res.setHeader('Allow', 'POST');
  res.end();
  return;
}
