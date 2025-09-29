import type { NextApiRequest, NextApiResponse } from 'next';
import { NextResponse, type NextRequest } from 'next/server';
import {
  checkSecurity,
  CSPMiddleware,
  methodNotAllowed,
  type NextFn,
  type Request,
  type Response,
} from './http';
import { handleMcp } from './http/handlers/mcp';
import { handleShell } from './http/handlers/shell';
import bodyParser from 'body-parser';
import type { TidewaveConfig } from './core';

const DEFAULT_CONFIG: TidewaveConfig = {
  allowRemoteAccess: false,
  allowedOrigins: [],
  port: 3000,
  host: 'localhost',
};

type NextJsHandler = (_req: NextApiRequest, _res: NextApiResponse) => Promise<void>;
type NextJsMiddleware = (_req: NextRequest) => Promise<NextResponse>;

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

function notfound(req: NextApiRequest, res: NextApiResponse): void {
  return res.status(404).json({ message: `Route not found: ${req.method} ${req.url}` });
}

const NEXT_HANDLERS: Record<string, (req: Request, res: Response, next: NextFn) => Promise<void>> =
  {
    mcp: connectWrapper(handleMcp),
    shell: connectWrapper(handleShell),
  };

export async function toNodeHandler(
  config: TidewaveConfig = DEFAULT_CONFIG,
): Promise<NextJsHandler> {
  return async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
    const next: () => void = () => {};
    await connectWrapper(CSPMiddleware)(req, res, next);
    const securityMiddleware = checkSecurity(config);
    await connectWrapper(securityMiddleware)(req, res, next);
    await connectWrapper(bodyParser.json())(req, res, next);

    // Parse endpoint manually, rewrite doesn't populate query
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const segments = url.pathname.split('/').filter(Boolean);
    const [_tidewave, endpoint] = segments;

    if (req.method !== 'POST') {
      return methodNotAllowed(res);
    }

    const handler = NEXT_HANDLERS[endpoint || ''];
    if (handler) return await handler(req, res, next);

    return notfound(req, res);
  };
}

export function toNextMiddleware(): NextJsMiddleware {
  return async function middleware(req: NextRequest): Promise<NextResponse> {
    const env = process.env.NODE_ENV;

    if (!(env === 'development'))
      return NextResponse.json(
        { message: 'Tidewave is designed to work only on dev environment' },
        { status: 406 },
      );

    const { pathname } = req.nextUrl;

    if (!isTidewaveRoute(pathname))
      return NextResponse.json({ message: `Route ${pathname} doesn't exist` }, { status: 404 });

    // since next.js v12, middleware doesn't
    // accept relative URLs
    return NextResponse.rewrite(new URL(`/api${pathname}`, req.url));
  };
}

export function isTidewaveRoute(pathname: string): boolean {
  return pathname.startsWith('/tidewave');
}
