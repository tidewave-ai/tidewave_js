import type { NextApiRequest, NextApiResponse } from 'next';
import { checkSecurity, type Request, type Response } from '../http';
import bodyParser from 'body-parser';
import type { TidewaveConfig } from '../core';
import { getProjectName } from '../core';

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

  if (process.env['NEXT_RUNTIME'] !== 'edge') {
    // Import instrumentation to automatically patch console
    await import('../logger/instrumentation');
  }

  // Set framework and projectName upfront
  config.framework = 'nextjs';
  config.projectName = config.projectName || (await getProjectName('next_app'));

  return async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
    const origin = req.headers.host;
    const url = new URL(req.url ?? '', `http://${origin}`);
    const segments = url.pathname.split('/').filter(Boolean);
    const [_tidewave, endpoint] = segments;

    if (!url.pathname.startsWith('/tidewave')) {
      return res.status(404).json({ message: 'This route only works when accessed at /tidewave' });
    }

    if (origin) {
      const [hostname, port] = origin.split(':');
      config.host = hostname ? hostname : config.host;
      config.port = port ? Number(port) : config.port;
    }

    const next: () => void = () => {};
    const securityMiddleware = checkSecurity(config);
    await connectWrapper(securityMiddleware)(req, res, next);
    await connectWrapper(bodyParser.json())(req, res, next);

    const { getHandlers } = await import('../http');
    const handlers = getHandlers(config);

    const handler = handlers[endpoint || ''];
    if (handler) return await connectWrapper(handler)(req, res, next);

    return res.status(404).json({ message: `Route not found: ${req.method} ${req.url}` });
  };
}
