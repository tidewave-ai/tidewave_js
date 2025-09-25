import type { NextApiRequest, NextApiResponse } from 'next';
import { NextResponse, type NextRequest } from 'next/server';
import {
  checkSecurity,
  methodNotAllowed,
  type TidewaveConfig,
  type Request,
  type Response,
  ENDPOINT,
} from './http';
import { handleMcp } from './http/handlers/mcp';
import { handleShell } from './http/handlers/shell';
import bodyParser from 'body-parser';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';

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

async function requestAdapter(next: NextRequest): Promise<Request> {
  const req: Request = new IncomingMessage(new Socket());
  const body = (await next.json()) as Record<string, unknown>;
  req.method = next.method;
  req.body = body;
  req.url = next.url;
  req.headers = Object.fromEntries(next.headers);
  return req;
}

function nextMethodNotAllowed(): NextResponse {
  return NextResponse.json(
    { message: 'method not allowed' },
    {
      headers: [['Allow', 'POST']],
      status: 405,
    },
  );
}

interface ResponseData {
  body: Buffer;
  statusCode: number;
  headers: Record<string, string>;
}

type StreamCallback = (_err: Error | null | undefined) => void;

function captureResponse(res: ServerResponse): Promise<ResponseData> {
  return new Promise(resolve => {
    const chunks: Buffer[] = [];

    const respdata: ResponseData = {
      body: Buffer.alloc(0),
      statusCode: 200,
      headers: {},
    };

    const originalSetHeader = res.setHeader.bind(res);

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    res.write = (chunk: any, encoding, cb?: StreamCallback): boolean => {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else if (typeof chunk === 'string') {
        const enc = typeof encoding === 'string' ? encoding : 'utf8';
        chunks.push(Buffer.from(chunk, enc));
      }

      if (typeof cb === 'function') {
        process.nextTick(cb);
      } else if (typeof encoding === 'function') {
        process.nextTick(encoding);
      }

      return true;
    };

    res.end = (
      chunk?: any /* eslint-disable-line @typescript-eslint/no-explicit-any */,
      encoding?: BufferEncoding | StreamCallback,
      cb?: StreamCallback,
    ): ServerResponse => {
      if (chunk) {
        if (Buffer.isBuffer(chunk)) {
          chunks.push(chunk);
        } else if (typeof chunk === 'string') {
          const enc = typeof encoding === 'string' ? encoding : 'utf8';
          chunks.push(Buffer.from(chunk, enc));
        }
      }

      respdata.statusCode = res.statusCode;

      if (res.getHeaders) {
        const responseHeaders = res.getHeaders();
        respdata.headers = Object.fromEntries(
          Object.entries(responseHeaders).map(([key, value]) => [
            key.toLowerCase(),
            Array.isArray(value) ? value.join(', ') : String(value),
          ]),
        );
      }

      respdata.body = Buffer.concat(chunks);

      // Handle callbacks
      if (typeof cb === 'function') {
        process.nextTick(cb);
      } else if (typeof encoding === 'function') {
        process.nextTick(encoding);
      }

      resolve(respdata);
      return res;
    };

    res.setHeader = (name: string, value: string | string[] | number): ServerResponse => {
      respdata.headers[name.toLowerCase()] = Array.isArray(value)
        ? value.join(', ')
        : String(value);
      return originalSetHeader(name, value);
    };
  });
}

export function toNextMiddleware(config: TidewaveConfig): NextJsMiddleware {
  return async function middleware(req: NextRequest): Promise<NextResponse> {
    const next: () => void = () => {};

    if (req.method !== 'POST') return nextMethodNotAllowed();

    const msg = await requestAdapter(req);
    const res = new ServerResponse(msg);

    const securityMiddleware = checkSecurity(config);
    await connectWrapper(securityMiddleware)(msg, res, next);

    const responsePromise = captureResponse(res);

    if (req.nextUrl.pathname === `${ENDPOINT}/mcp`) {
      await connectWrapper(handleMcp)(msg, res, next);
      const responseData = await responsePromise;
      return new NextResponse(responseData.body.toString(), {
        status: responseData.statusCode,
        headers: responseData.headers,
      });
    }

    if (req.nextUrl.pathname === `${ENDPOINT}/shell`) {
      console.log('Ih, passou por aqui');
      await connectWrapper(handleShell)(msg, res, next);
      const responseData = await responsePromise;
      console.log('Aqui oh', responseData);
      return new NextResponse(responseData.body.toString(), {
        status: responseData.statusCode,
        headers: responseData.headers,
      });
    }

    return NextResponse.json({ message: `Route not found: ${req.method} ${req.nextUrl.pathname}` });
  };
}
