import type { TidewaveConfig } from '../../core';
import type { TidewaveHandler, TidewaveNext, TidewaveRequest, TidewaveResponse } from '../types';

export function createHandleHtml(config: TidewaveConfig): TidewaveHandler {
  return createHtmlHandler(config, 'tc.js', {
    pathnames: ['', '/', '/tidewave'],
  });
}

export function createHandleAppHtml(config: TidewaveConfig): TidewaveHandler {
  return createHtmlHandler(config, 'control.js', {
    pathnames: ['', '/', '/app', '/tidewave/app'],
    headers: {
      'Content-Security-Policy': "base-uri 'self'; frame-ancestors 'self';",
    },
  });
}

function createHtmlHandler(
  config: TidewaveConfig,
  script: 'tc.js' | 'control.js',
  options: { headers?: Record<string, string>; pathnames: string[] },
): TidewaveHandler {
  return async function handleHtml(
    req: TidewaveRequest,
    res: TidewaveResponse,
    next: TidewaveNext,
  ): Promise<void> {
    // Only handle exact mounted paths, not sub-paths.
    const url = req.url || '/';
    const pathname = url.split('?')[0] || '';

    // Different connect-style middleware stacks may strip different URL prefixes.
    if (!options.pathnames.includes(pathname)) {
      return next();
    }

    try {
      const clientUrl = config.clientUrl || 'https://tidewave.ai';

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html');
      for (const [header, value] of Object.entries(options.headers || {})) {
        res.setHeader(header, value);
      }
      res.end(`
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script type="module" src="${clientUrl}/tc/${script}"></script>
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
