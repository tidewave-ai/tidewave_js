import type { NextApiRequest, NextApiResponse } from 'next';
import { checkSecurity, HANDLERS, methodNotAllowed, type Request, type Response } from './http';
import bodyParser from 'body-parser';
import type { TidewaveConfig } from './core';

const DEFAULT_CONFIG: TidewaveConfig = {};

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

function connectWrapper<Req extends Request, Res extends Response>(
  fn: ExpressRequestHandler<Req, Res>,
): Nextable<RequestHandler<Req, Res>> {
  return (req, res, next) =>
    new Promise<void>((resolve, reject) => {
      fn(req, res, err => (err ? reject(err) : resolve()));
    }).then(next);
}

export async function tidewaveHandler(
  config: TidewaveConfig = DEFAULT_CONFIG,
): Promise<NextJsHandler> {
  const env = process.env['NODE_ENV'];

  if (!(env === 'development')) {
    throw Error(
      `[Tidewave] tidewave is designed to only work on development environment, got: ${env}`,
    );
  }

  return async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
    const origin = req.headers.host;

    if (origin) {
      const [hostname, port] = origin.split(':');
      config.host = hostname ? hostname : config.host;
      config.port = port ? Number(port) : config.port;
    }

    const next: () => void = () => {};
    const securityMiddleware = checkSecurity(config);
    await connectWrapper(securityMiddleware)(req, res, next);
    await connectWrapper(bodyParser.json())(req, res, next);

    // Parse endpoint manually, rewrite doesn't populate query
    const url = new URL(req.url ?? '', `http://${origin}`);
    const segments = url.pathname.split('/').filter(Boolean);
    const [_tidewave, endpoint] = segments;

    if (req.method !== 'POST') {
      return methodNotAllowed(res);
    }

    const handler = HANDLERS[endpoint || ''];
    if (handler) return await connectWrapper(handler)(req, res, next);

    return res.status(404).json({ message: `Route not found: ${req.method} ${req.url}` });
  };
}
