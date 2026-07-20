import type { TidewaveConfig } from '../core';
import { injectToolbarHtml } from '../toolbar';
import type { LocalPortGetter } from './handlers/config';
import type { TidewaveHandler, TidewaveNext, TidewaveRequest, TidewaveResponse } from './types';

export function createHandleResponseHeaders(
  config: TidewaveConfig,
  getLocalPort?: LocalPortGetter,
): TidewaveHandler {
  return async function handleResponseHeaders(
    req: TidewaveRequest,
    res: TidewaveResponse,
    next: TidewaveNext,
  ): Promise<void> {
    if (!isTidewaveRequest(req)) {
      if (shouldBufferHtml(req, config)) {
        wrapHtmlResponseBody(res, config, getLocalPort);
      }
    }

    next();
  };
}

function wrapHtmlResponseBody(
  res: TidewaveResponse,
  config: TidewaveConfig,
  getLocalPort?: LocalPortGetter,
): void {
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  const chunks: Buffer[] = [];

  res.write = function write(chunk: unknown, ...args: unknown[]): boolean {
    if (chunk !== undefined) chunks.push(toBuffer(chunk));

    const callback = args.find(arg => typeof arg === 'function');
    if (typeof callback === 'function') callback();

    return true;
  } as TidewaveResponse['write'];

  res.end = function end(chunk?: unknown, ...args: unknown[]): TidewaveResponse {
    const callback = endCallback(chunk, args);

    if (chunk !== undefined && typeof chunk !== 'function') {
      chunks.push(toBuffer(chunk));
    }

    if (!htmlResponse(res)) {
      if (chunks.length > 0) {
        originalWrite(Buffer.concat(chunks));
      }

      return callback ? originalEnd(callback) : originalEnd();
    }

    const originalBody = Buffer.concat(chunks).toString('utf8');
    const body = injectToolbarHtml(originalBody, config, getLocalPort);

    if (body !== originalBody && !res.headersSent) {
      res.removeHeader('content-length');
    }

    return callback ? originalEnd(body, callback) : originalEnd(body);
  } as TidewaveResponse['end'];
}

function toBuffer(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (chunk instanceof Uint8Array) return Buffer.from(chunk);
  return Buffer.from(String(chunk));
}

function htmlResponse(res: TidewaveResponse): boolean {
  const contentType = res.getHeader('content-type');
  if (Array.isArray(contentType)) {
    return contentType.some(type => String(type).startsWith('text/html'));
  }

  return String(contentType || '').startsWith('text/html');
}

function shouldBufferHtml(req: TidewaveRequest, config: TidewaveConfig): boolean {
  if (config.toolbar === false) return false;
  if (req.method === 'HEAD') return false;

  const accept = firstHeaderValue(req.headers.accept);
  const fetchDest = firstHeaderValue(req.headers['sec-fetch-dest']);

  return accept?.includes('text/html') === true || fetchDest === 'document';
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function endCallback(chunk: unknown, args: unknown[]): (() => void) | undefined {
  if (typeof chunk === 'function') return chunk as () => void;

  const callback = args.find(arg => typeof arg === 'function');
  return typeof callback === 'function' ? (callback as () => void) : undefined;
}

function isTidewaveRequest(req: TidewaveRequest): boolean {
  const url = req.url || '';
  const pathname = url.split('?')[0] || '';

  return pathname === '/tidewave' || pathname.startsWith('/tidewave/');
}
