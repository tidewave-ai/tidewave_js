import { expressWrapper } from 'next-connect';
import type { NextApiRequest, NextApiResponse } from 'next';
import { checkSecurity, methodNotAllowed, type TidewaveConfig } from './http';
import { handleMcp } from './http/handlers/mcp';
import { handleShell } from './http/handlers/shell';
import bodyParser from 'body-parser';

const DEFAULT_CONFIG: TidewaveConfig = {
  allowRemoteAccess: false,
  allowedOrigins: [],
  port: 3000,
  host: 'localhost',
};

type NextHandler = (_req: NextApiRequest, _res: NextApiResponse) => Promise<void>;

export function toNodeHandler(config: TidewaveConfig = DEFAULT_CONFIG): NextHandler {
  // we don't need any `next` request handler
  const next: () => void = () => {};

  return async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
    const securityMiddleware = checkSecurity(config);
    await expressWrapper(securityMiddleware)(req, res, next);
    await expressWrapper(bodyParser.json())(req, res, next);

    const path = req.query.path as string[];
    const endpoint = path?.[0];

    if (req.method !== 'POST') {
      return methodNotAllowed(res);
    }

    if (endpoint === 'mcp') return handleMcp(req, res, next);
    if (endpoint === 'shell') return handleShell(req, res, next);

    res.status(404).json({ message: `Route not found: ${req.method} ${req.url}` });
  };
}
