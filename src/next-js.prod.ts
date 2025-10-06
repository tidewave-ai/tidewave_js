import type { NextApiRequest, NextApiResponse } from 'next';
/**
 * Production stub for Tidewave Next.js handler.
 * In production builds, this returns a handler that simply returns 404.
 * This prevents the MCP server and dev tools from being included in production bundles.
 */
export async function tidewaveHandler() {
  return (_req: NextApiRequest, res: NextApiResponse): void => {
    res.status(404).end();
  };
}
