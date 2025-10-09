import path from 'path';
import fs from 'fs/promises';
import type { NextApiRequest, NextApiResponse } from 'next';
import { checkSecurity, HANDLERS, methodNotAllowed, type Request, type Response } from './http';
import bodyParser from 'body-parser';
import type { TidewaveConfig } from './core';
import { default as tidewavePackage } from '../package.json' with { type: 'json' };

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

    if (req.method === 'GET' && endpoint === 'index') {
      return await respondTidewaveHTML(res, config);
    }

    if (req.method === 'GET' && endpoint === 'config') {
      return await respondTidewaveConfigJSON(res, config);
    }

    if (req.method !== 'POST') {
      return methodNotAllowed(res);
    }

    const handler = HANDLERS[endpoint || ''];
    if (handler) return await connectWrapper(handler)(req, res, next);

    return res.status(404).json({ message: `Route not found: ${req.method} ${req.url}` });
  };
}

async function respondTidewaveHTML(res: NextApiResponse, config: TidewaveConfig): Promise<void> {
  const clientUrl = config.clientUrl || 'https://tidewave.ai';

  const tidewaveConfig = await tidewaveConfigJSON(config);

  res.status(200).setHeader('Content-Type', 'text/html').end(`
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="tidewave:config" content="${escapeHtml(JSON.stringify(tidewaveConfig))}" />
        <script type="module" src="${clientUrl}/tc/tc.js"></script>
      </head>
      <body></body>
    </html>
  `);
}

async function respondTidewaveConfigJSON(
  res: NextApiResponse,
  config: TidewaveConfig,
): Promise<void> {
  const tidewaveConfig = await tidewaveConfigJSON(config);
  res.status(200).json(tidewaveConfig);
}

async function tidewaveConfigJSON(config: TidewaveConfig): Promise<object> {
  return {
    project_name: await getProjectName(),
    framework_type: 'nextjs',
    tidewave_version: tidewavePackage.version,
    team: config.team || {},
  };
}

async function getProjectName(): Promise<string> {
  const rootDir = process.cwd();
  const packageJsonPath = path.join(rootDir, 'package.json');
  try {
    const packageJson = await fs.readFile(packageJsonPath, 'utf8');
    const { name } = JSON.parse(packageJson);
    return name || 'next_app';
  } catch {
    return 'next_app';
  }
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };

  return text.replace(/[&<>"']/g, match => map[match]!);
}
