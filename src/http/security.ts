import type { TidewaveConfig } from '../core';
import type { TidewaveRequest, TidewaveResponse } from './types';

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
