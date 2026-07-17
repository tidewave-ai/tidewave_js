import type { TidewaveConfig } from '../core';
import { injectToolbarHtml } from '../toolbar';
import type { LocalPortGetter } from './handlers/config';
import type { TidewaveHandler, TidewaveNext, TidewaveRequest, TidewaveResponse } from './types';

type HeaderValue = number | string | string[];
type HeaderMap = Record<string, HeaderValue | undefined>;

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
      wrapResponseHeaders(res, config);
      if (shouldBufferHtml(req, config)) {
        wrapHtmlResponseBody(res, config, getLocalPort);
      }
    }

    next();
  };
}

export function rewriteCsp(config: TidewaveConfig, csp: string): string {
  const hasTrailingSemicolon = /;\s*$/.test(csp);
  const toolbarHost =
    config.toolbar === false ? '' : `${config.clientUrl || 'https://tidewave.ai'} `;
  const directives = csp
    .split(';')
    .map(directive => directive.trim())
    .filter(Boolean)
    .flatMap(directive => {
      if (directive.startsWith('frame-ancestors')) return [];

      const [policy, values] = splitDirective(directive);
      if (policy !== 'script-src' || !values) return [directive];

      if (values.includes("'unsafe-eval'")) {
        return [`script-src ${toolbarHost}${values}`];
      }

      return [`script-src ${toolbarHost}'unsafe-eval' ${values}`];
    });

  return `${directives.join('; ')}${hasTrailingSemicolon ? '; ' : ''}`;
}

function wrapResponseHeaders(res: TidewaveResponse, config: TidewaveConfig): void {
  const originalSetHeader = res.setHeader.bind(res);
  const originalWriteHead = res.writeHead.bind(res);

  res.removeHeader('x-frame-options');

  res.setHeader = (name, value): TidewaveResponse => {
    const header = name.toLowerCase();

    if (header === 'x-frame-options') {
      return res;
    }

    return originalSetHeader(name, rewriteHeader(config, header, value));
  };

  res.writeHead = function writeHead(...args: unknown[]): TidewaveResponse {
    const headersIndex = typeof args[1] === 'object' && args[1] !== null ? 1 : 2;
    const headers = args[headersIndex];

    if (isHeaderMap(headers)) {
      args[headersIndex] = rewriteHeaders(config, headers);
    }

    return originalWriteHead(...(args as Parameters<TidewaveResponse['writeHead']>));
  } as TidewaveResponse['writeHead'];
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

function rewriteHeaders(config: TidewaveConfig, headers: HeaderMap): Record<string, HeaderValue> {
  const rewritten: Record<string, HeaderValue> = {};

  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;

    const header = name.toLowerCase();

    if (header === 'x-frame-options') continue;

    rewritten[name] = rewriteHeader(config, header, value);
  }

  return rewritten;
}

function rewriteHeader(
  config: TidewaveConfig,
  header: string,
  value: number | string | readonly string[],
): HeaderValue {
  if (Array.isArray(value)) {
    if (header !== 'content-security-policy') return [...value];
    return value.map(item => rewriteCsp(config, item));
  }

  const scalar = value as number | string;

  if (header !== 'content-security-policy') return scalar;
  if (typeof scalar === 'string') return rewriteCsp(config, scalar);
  return scalar;
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

function splitDirective(directive: string): [string, string?] {
  const index = directive.indexOf(' ');
  if (index === -1) return [directive];

  return [directive.slice(0, index), directive.slice(index + 1)];
}

function isHeaderMap(value: unknown): value is HeaderMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTidewaveRequest(req: TidewaveRequest): boolean {
  const url = req.url || '';
  const pathname = url.split('?')[0] || '';

  return pathname === '/tidewave' || pathname.startsWith('/tidewave/');
}
