import type { NextApiRequest, NextApiResponse } from 'next';
import {
  checkSecurity,
  methodNotAllowed,
  type TidewaveConfig,
  type Request,
  type Response,
} from './http';
import { handleMcp } from './http/handlers/mcp';
import { handleShell } from './http/handlers/shell';
import bodyParser from 'body-parser';

const DEFAULT_CONFIG: TidewaveConfig = {
  allowRemoteAccess: false,
  allowedOrigins: [],
  port: 3000,
  host: 'localhost',
};

type NextJsHandler = (_req: NextApiRequest, _res: NextApiResponse) => Promise<void>;

type NextHandler = () => ValueOrPromise<unknown>;

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export type FunctionLike = (...args: any[]) => unknown;

export type Nextable<H extends FunctionLike> = (
  ...args: [...Parameters<H>, NextHandler]
) => ValueOrPromise<any>; /* eslint-disable-line @typescript-eslint/no-explicit-any */

export type ValueOrPromise<T> = T | Promise<T>;

type NextFunction = (err?: unknown) => void;

type ExpressRequestHandler<Req, Res> = (req: Req, res: Res, next: NextFunction) => void;

export type RequestHandler<Req extends Request, Res extends Response> = (
  req: Req,
  res: Res,
) => ValueOrPromise<void>;

export function connectWrapper<Req extends Request, Res extends Response>(
  fn: ExpressRequestHandler<Req, Res>,
): Nextable<RequestHandler<Req, Res>> {
  return (req, res, next) =>
    new Promise<void>((resolve, reject) => {
      fn(req, res, err => (err ? reject(err) : resolve()));
    }).then(next);
}

export function toNodeHandler(config: TidewaveConfig = DEFAULT_CONFIG): NextJsHandler {
  // we don't need any `next` request handler
  const next: () => void = () => {};

  return async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
    const securityMiddleware = checkSecurity(config);
    await connectWrapper(securityMiddleware)(req, res, next);
    await connectWrapper(bodyParser.json())(req, res, next);

    const path = req.query.path as string[];
    const endpoint = path?.[0];

    if (req.method !== 'POST') {
      return methodNotAllowed(res);
    }

    if (endpoint === 'mcp') return connectWrapper(handleMcp)(req, res, next);
    if (endpoint === 'shell') return connectWrapper(handleShell)(req, res, next);

    return res.status(404).json({ message: `Route not found: ${req.method} ${req.url}` });
  };
}
