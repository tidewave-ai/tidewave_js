import type { TidewaveConfig } from '../core';
import type { TidewaveRequest, TidewaveResponse } from './types';

export type SecurityCheckResult =
  | { ok: true }
  | {
      ok: false;
      statusCode: 403;
      message: string;
    };

function fetchRemoteIp(req: TidewaveRequest): string | null {
  const remote = req.socket.remoteAddress;

  if (remote) return remote;

  const realIp = firstHeaderValue(req.headers['x-real-ip']);
  if (realIp) return realIp;

  const forwardedFor = firstHeaderValue(req.headers['x-forwarded-for']);
  if (forwardedFor) return forwardedFor.split(',')[0]?.trim() || null;

  return null;
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export function checkRemoteIp(
  req: TidewaveRequest,
  res: TidewaveResponse,
  config: TidewaveConfig,
): boolean {
  const result = validateRemoteIp(req, config);
  if (result.ok) return true;

  sendSecurityFailure(res, result);
  return false;
}

export function validateRemoteIp(
  req: TidewaveRequest,
  config: TidewaveConfig,
): SecurityCheckResult {
  const ip = fetchRemoteIp(req);

  if (!ip) {
    return {
      ok: false,
      statusCode: 403,
      message:
        'For security reasons, Tidewave does not accept requests without a remote IP address.',
    };
  }

  if (isLocalIp(ip)) return { ok: true };
  if (config.allowRemoteAccess) return { ok: true };

  const message =
    'For security reasons, Tidewave does not accept remote connections by default.\n\nIf you really want to allow remote connections, configure the Tidewave with the `allowRemoteAccess: true` option.';
  return { ok: false, statusCode: 403, message };
}

export function checkOrigin(
  req: TidewaveRequest,
  res: TidewaveResponse,
  config: TidewaveConfig,
): boolean {
  const result = validateOrigin(req, config);
  if (result.ok) return true;

  sendSecurityFailure(res, result);
  return false;
}

export function validateOrigin(req: TidewaveRequest, config: TidewaveConfig): SecurityCheckResult {
  const { origin } = req.headers;

  // No origin header means non-browser request (e.g. Claude Code, Cursor)
  if (!origin) return { ok: true };

  const allowedOrigins = config.allowedOrigins || getDefaultAllowedOrigins(config);
  const originUrl = parseUrl(origin);

  if (!originUrl) {
    const message = `For security reasons, Tidewave only accepts requests from allowed origins.\n\nInvalid origin: ${origin}`;
    return { ok: false, statusCode: 403, message };
  }

  const isAllowed = allowedOrigins.some(allowed => isOriginAllowed(originUrl, parseUrl(allowed)));

  if (!isAllowed) {
    const message = `For security reasons, Tidewave only accepts requests from the same origin your web app is running on.\n\nIf you really want to allow remote connections, configure the Tidewave with the \`allowedOrigins: [${JSON.stringify(origin)}]\` option.`;
    return { ok: false, statusCode: 403, message };
  }

  return { ok: true };
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

function sendSecurityFailure(
  res: TidewaveResponse,
  result: Exclude<SecurityCheckResult, { ok: true }>,
): void {
  console.warn(result.message);
  res.statusCode = result.statusCode;
  res.end(result.message);
}
