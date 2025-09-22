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
  const router = createRouter<NextApiRequest, NextApiResponse>();
  router.use(expressWrapper(checkSecurity(config)));
  router.use(expressWrapper(bodyParser.json()));
  router.post('/mcp', expressWrapper(handleMcp));
  router.post('/shell', expressWrapper(handleShell));

  return router.handler({
    onError: (err: unknown, req: NextApiRequest, res: NextApiResponse) => {
      console.error('[Tidewave] Handler error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          message: `Internal server error from: ${req.url}`,
          data: err instanceof Error ? err.message : String(err),
        });
      }
    },
    // onNoMatch: (req: NextApiRequest, res: NextApiResponse) => {
    //   res.status(404).json({ message: `Route not found: ${req.url}` });
    // },
  });
}
