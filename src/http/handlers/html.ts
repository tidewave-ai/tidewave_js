import type { Request, Response, NextFn, Handler } from '../index';
import type { TidewaveConfig } from '../../core';
import { default as tidewavePackage } from '../../../package.json' with { type: 'json' };

export function createHandleHtml(config: TidewaveConfig): Handler {
  return async function handleHtml(req: Request, res: Response, next: NextFn): Promise<void> {
    // Only handle exact /tidewave path, not sub-paths
    if (req.url !== '/' && req.url !== '') {
      return next();
    }

    try {
      const clientUrl = config.clientUrl || 'https://tidewave.ai';
      const tidewaveConfig = {
        project_name: config.projectName || 'app',
        framework_type: config.framework || 'unknown',
        tidewave_version: tidewavePackage.version,
        team: config.team || {},
      };

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html');
      res.end(`
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
