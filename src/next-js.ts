import { createRouter, expressWrapper } from 'next-connect';
import type { NextApiRequest, NextApiResponse } from 'next';
import { checkSecurity, ENDPOINT, type TidewaveConfig } from './http';
import { handleMcp } from './http/handlers/mcp';
import { handleShell } from './http/handlers/shell';
import bodyParser from 'body-parser';

const DEFAULT_CONFIG: TidewaveConfig = {
  allowRemoteAccess: false,
  allowedOrigins: [],
  port: 3000,
  host: 'localhost',
};

export function toNodeHandler(config: TidewaveConfig = DEFAULT_CONFIG) {
  const router = createRouter<NextApiRequest, NextApiResponse>();

  // Reuse existing security middleware
  router.use(expressWrapper(checkSecurity(config)));

  // Reuse existing body parser
  router.use(expressWrapper(bodyParser.json()));

  // Reuse existing handlers with expressWrapper
  router.post(`${ENDPOINT}/mcp`, expressWrapper(handleMcp));
  router.post(`${ENDPOINT}/shell`, expressWrapper(handleShell));

  return router.handler({
    onError: (err: unknown, req: NextApiRequest, res: NextApiResponse) => {
      console.error('[Tidewave] Handler error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32603,
            message: 'Internal server error',
            data: err instanceof Error ? err.message : String(err),
          },
        });
      }
    },
    onNoMatch: (req: NextApiRequest, res: NextApiResponse) => {
      res.status(404).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32601,
          message: 'Method not found',
        },
      });
    },
  });
}
