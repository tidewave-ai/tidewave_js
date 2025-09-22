import { createRouter, expressWrapper } from 'next-connect';
import type { NextApiRequest, NextApiResponse } from 'next';
import { checkSecurity, type TidewaveConfig } from './http';
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
  const next: () => Promise<boolean> = () => new Promise(resolve => resolve(true));

  return async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
    const securityMiddleware = checkSecurity(config);
    await expressWrapper(securityMiddleware)(req, res, next);
    await expressWrapper(bodyParser.json())(req, res, next);

    const path = req.query.path as string[];
    const endpoint = path?.[0];

    if (req.method === 'POST') {
      if (endpoint === 'mcp') {
        return handleMcp(req as any, res as any, () => {});
      } else if (endpoint === 'shell') {
        return handleShell(req as any, res as any, () => {});
      }
    }

    res.status(404).json({ message: `Route not found: ${req.method} ${req.url}` });
  };
}
