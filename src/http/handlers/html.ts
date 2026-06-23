import type { TidewaveConfig } from '../../core';
import type { TidewaveHandler, TidewaveNext, TidewaveRequest, TidewaveResponse } from '../types';

export function createHandleHtml(config: TidewaveConfig): TidewaveHandler {
  return async function handleHtml(
    req: TidewaveRequest,
    res: TidewaveResponse,
    next: TidewaveNext,
  ): Promise<void> {
    // Only handle exact /tidewave path, not sub-paths
    const url = req.url || '/';
    const [pathname] = url.split('?');

    // Different connect-style middleware stacks may strip different URL prefixes.
    if (pathname !== '' && pathname !== '/' && pathname !== '/tidewave') {
      return next();
    }

    try {
      const clientUrl = config.clientUrl || 'https://tidewave.ai';

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html');
      res.end(`
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script type="module" src="${clientUrl}/tc/tc.js"></script>
  </head>
  <body></body>
</html>
  `);
    } catch (err) {
      console.error(`[Tidewave] Failed to serve HTML: ${err}`);

      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/html');
        res.end('<html><body>Internal server error</body></html>');
      }

      next(err);
    }
  };
}
