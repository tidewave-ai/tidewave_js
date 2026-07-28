import type { TidewaveConfig } from '../../core';
import {
  escapeHtmlAttribute,
  type LocalRequestInfoGetter,
  tidewaveConfigMetaHtml,
} from '../../config';
import type { TidewaveHandler, TidewaveNext, TidewaveRequest, TidewaveResponse } from '../types';

export function createHandleHtml(config: TidewaveConfig): TidewaveHandler {
  return createHtmlHandler(() => entrypointHtml(config));
}

export function createHandleControlHtml(
  config: TidewaveConfig,
  getLocalRequestInfo?: LocalRequestInfoGetter<TidewaveRequest>,
): TidewaveHandler {
  return createHtmlHandler(req => controlHtml(config, getLocalRequestInfo, req), {
    headers: {
      'Content-Security-Policy': "base-uri 'self'; frame-ancestors 'self';",
    },
  });
}

function createHtmlHandler(
  renderHtml: (req: TidewaveRequest) => string,
  options: {
    headers?: Record<string, string>;
  } = {},
): TidewaveHandler {
  return async function handleHtml(
    req: TidewaveRequest,
    res: TidewaveResponse,
    next: TidewaveNext,
  ): Promise<void> {
    // Only handle exact mounted paths, not sub-paths.
    const url = req.url || '/';
    const pathname = url.split('?')[0] || '';

    // Vite strips the prefix passed to server.use, so we can always check /
    if (pathname !== '/') {
      return next();
    }

    try {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html');
      for (const [header, value] of Object.entries(options.headers || {})) {
        res.setHeader(header, value);
      }
      res.end(renderHtml(req));
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

function entrypointHtml(config: TidewaveConfig): string {
  const clientUrl = config.clientUrl || 'https://tidewave.ai';

  return `
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script type="module" src="${escapeHtmlAttribute(`${clientUrl}/tc/tc.js`)}"></script>
  </head>
  <body></body>
</html>
  `;
}

function controlHtml(
  config: TidewaveConfig,
  getLocalRequestInfo?: LocalRequestInfoGetter<TidewaveRequest>,
  req?: TidewaveRequest,
): string {
  const clientUrl = config.clientUrl || 'https://tidewave.ai';

  return `
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${tidewaveConfigMetaHtml(config, getLocalRequestInfo, req)}
    <script type="module" src="${escapeHtmlAttribute(`${clientUrl}/tc/control.js`)}"></script>
  </head>
  <body></body>
</html>
  `;
}
