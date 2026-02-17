import type { TidewaveConfig } from '../core';
import type { Request, Response } from './index';

function fetchRemoteIp(req: Request): string | null {
  const remote = req.socket.remoteAddress;

  if (remote) return remote;

  const ip = (req.headers['x-real-ip'] && req.headers['x-forwarded-for']) || null;

  if (Array.isArray(ip)) {
    return ip.join();
  }

  return ip;
}

export function checkRemoteIp(req: Request, res: Response, config: TidewaveConfig): boolean {
  const ip = fetchRemoteIp(req);

  if (!ip) return false;
  if (isLocalIp(ip)) return true;
  if (config.allowRemoteAccess) return true;

  const message =
    'For security reasons, Tidewave does not accept remote connections by default.\n\nIf you really want to allow remote connections, configure the Tidewave with the `allowRemoteAccess: true` option.';
  console.warn(message);
  res.statusCode = 403;
  res.end(message);
  return false;
}

export function isLocalIp(ip?: string): boolean {
  if (!ip) return false;

  // IPv4 localhost (only 127.0.0.x range)
  if (ip.startsWith('127.0.0.')) return true;

  // IPv6 localhost
  if (ip === '::1') return true;

  // IPv4 mapped IPv6 localhost (::ffff:127.0.0.1)
  if (ip === '::ffff:127.0.0.1') return true;

  return false;
}

export function checkOrigin(req: Request, res: Response, _config: TidewaveConfig): boolean {
  const { origin } = req.headers;
  const url = req.url || '/';
  const [pathname] = url.split('?');

  // GET / (root HTML page) allows any origin
  if (
    pathname === '/' ||
    pathname === '' ||
    pathname === '/tidewave' ||
    pathname === '/tidewave/'
  ) {
    return true;
  }

  // No origin header means non-browser request (e.g. Claude Code, Cursor)
  if (!origin) return true;

  // /config and /mcp refuse if origin header is set
  const message =
    'For security reasons, Tidewave does not accept requests with an origin header for this endpoint.';
  console.warn(message);
  res.statusCode = 403;
  res.end(message);
  return false;
}
