import type { Request, Response, TidewaveConfig } from './index';

export function checkRemoteIp(req: Request, res: Response, config: TidewaveConfig): boolean {
  const { remoteAddress } = req.socket;
  if (isLocalIp(remoteAddress)) return true;
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

export function checkOrigin(req: Request, res: Response, config: TidewaveConfig): boolean {
  const { origin } = req.headers;

  // No origin header means non-browser request (e.g. Claude Code, Cursor)
  if (!origin) return true;

  const allowedOrigins = config.allowedOrigins || getDefaultAllowedOrigins(config);
  const originUrl = parseUrl(origin);

  if (!originUrl) {
    const message = `For security reasons, Tidewave only accepts requests from allowed origins.\n\nInvalid origin: ${origin}`;
    console.warn(message);
    res.statusCode = 403;
    res.end(message);
    return false;
  }

  const isAllowed = allowedOrigins.some(allowed => isOriginAllowed(originUrl, parseUrl(allowed)));

  if (!isAllowed) {
    const message = `For security reasons, Tidewave only accepts requests from the same origin your web app is running on.\n\nIf you really want to allow remote connections, configure the Tidewave with the \`allowedOrigins: [${JSON.stringify(origin)}]\` option.`;
    console.warn(message);
    res.statusCode = 403;
    res.end(message);
    return false;
  }

  return true;
}

export function getDefaultAllowedOrigins(config: TidewaveConfig): string[] {
  const { host, port } = config;
  if (!(host || port)) return [];
  return [`http://${host}:${port}`, `https://${host}:${port}`];
}

export function parseUrl(url: string): { scheme?: string; host: string; port?: number } | null {
  try {
    const isProtocolRelative = url.startsWith('//');
    const parsed = new URL(isProtocolRelative ? 'http:' + url : url);
    return {
      scheme: isProtocolRelative ? undefined : parsed.protocol?.slice(0, -1),
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port) : undefined,
    };
  } catch {
    return null;
  }
}

export function isOriginAllowed(
  origin: ReturnType<typeof parseUrl>,
  allowed: ReturnType<typeof parseUrl>,
): boolean {
  if (!origin || !allowed) return false;

  // Check scheme (if specified in allowed)
  if (allowed.scheme && origin.scheme !== allowed.scheme) return false;

  // Check port (if specified in allowed)
  if (allowed.port && origin.port !== allowed.port) return false;

  // Check host with wildcard support
  if (allowed.host.startsWith('*.')) {
    const allowedDomain = allowed.host.slice(2);
    return origin.host === allowedDomain || origin.host.endsWith('.' + allowedDomain);
  }

  return origin.host === allowed.host;
}
