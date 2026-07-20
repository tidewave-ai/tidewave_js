import type { TidewaveConfig } from '../core';
import { injectToolbarHtml, toolbarAlreadyInjected } from '../toolbar';
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
      if (shouldInspectHtml(req, config)) {
        wrapHtmlResponseBody(res, config, getLocalPort);
      }
    }

    next();
  };
}

type ToolbarInjectionState = 'unchecked' | 'searching' | 'skip' | 'injected';

function wrapHtmlResponseBody(
  res: TidewaveResponse,
  config: TidewaveConfig,
  getLocalPort?: LocalPortGetter,
): void {
  const originalWrite = res.write.bind(res) as (...args: unknown[]) => boolean;
  const originalEnd = res.end.bind(res) as (...args: unknown[]) => TidewaveResponse;
  const originalWriteHead = res.writeHead.bind(res) as (...args: unknown[]) => TidewaveResponse;
  let state: ToolbarInjectionState = 'unchecked';
  let removedContentLength = false;

  res.writeHead = function writeHead(...args: unknown[]): TidewaveResponse {
    const headers = writeHeadHeaders(args);

    if (state === 'unchecked') {
      state = htmlResponse(res, headers) ? 'searching' : 'skip';
    }

    if (state === 'searching') {
      removeContentLength();
      removeContentLengthFromHeaders(headers);
    }

    return originalWriteHead(...args);
  } as TidewaveResponse['writeHead'];

  res.write = function write(chunk: unknown, ...args: unknown[]): boolean {
    const outgoing = transformChunk(chunk, args);
    if (state === 'searching') removeContentLength();
    return originalWrite(outgoing, ...args);
  } as TidewaveResponse['write'];

  res.end = function end(chunk?: unknown, ...args: unknown[]): TidewaveResponse {
    if (chunk === undefined || typeof chunk === 'function') {
      return originalEnd(chunk, ...args);
    }

    return originalEnd(transformChunk(chunk, args), ...args);
  } as TidewaveResponse['end'];

  function transformChunk(chunk: unknown, args: unknown[]): unknown {
    if (state === 'unchecked') {
      if (res.headersSent) {
        state = 'skip';
        return chunk;
      }

      state = htmlResponse(res) ? 'searching' : 'skip';
    }

    if (state !== 'searching') return chunk;
    if (res.headersSent && !removedContentLength) {
      state = 'skip';
      return chunk;
    }

    const html = chunkToString(chunk, args);
    if (toolbarAlreadyInjected(html)) {
      state = 'skip';
      return chunk;
    }

    const injectedHtml = injectToolbarHtml(html, config, getLocalPort);
    if (injectedHtml === html) return chunk;

    state = 'injected';
    removeContentLength();
    return replaceChunk(chunk, injectedHtml, args);
  }

  function removeContentLength(): void {
    if (removedContentLength || res.headersSent) return;

    res.removeHeader('content-length');
    removedContentLength = true;
  }
}

function chunkToString(chunk: unknown, args: unknown[]): string {
  if (typeof chunk === 'string') return chunk;
  if (Buffer.isBuffer(chunk)) return chunk.toString(chunkEncoding(args));
  if (chunk instanceof Uint8Array) return Buffer.from(chunk).toString(chunkEncoding(args));

  return String(chunk);
}

function replaceChunk(chunk: unknown, value: string, args: unknown[]): string | Buffer {
  if (typeof chunk === 'string') return value;
  return Buffer.from(value, chunkEncoding(args));
}

function chunkEncoding(args: unknown[]): BufferEncoding {
  const encoding = args.find((arg): arg is BufferEncoding => typeof arg === 'string');
  return encoding || 'utf8';
}

function htmlResponse(res: TidewaveResponse, headers?: unknown): boolean {
  if (encodedResponse(res, headers)) return false;

  const contentType = headerValue(headers, 'content-type');
  if (contentType !== undefined) {
    return htmlContentType(contentType);
  }

  return htmlContentType(res.getHeader('content-type'));
}

function htmlContentType(contentType: HeaderValue | undefined): boolean {
  if (Array.isArray(contentType)) {
    return contentType.some(type => String(type).toLowerCase().startsWith('text/html'));
  }

  return String(contentType || '')
    .toLowerCase()
    .startsWith('text/html');
}

function encodedResponse(res: TidewaveResponse, headers?: unknown): boolean {
  const contentEncoding = headerValue(headers, 'content-encoding');
  if (contentEncoding !== undefined) {
    return encodedContent(contentEncoding);
  }

  return encodedContent(res.getHeader('content-encoding'));
}

function encodedContent(contentEncoding: HeaderValue | undefined): boolean {
  if (Array.isArray(contentEncoding)) {
    return contentEncoding.some(encodedContent);
  }

  const encoding = String(contentEncoding || '')
    .trim()
    .toLowerCase();

  return encoding !== '' && encoding !== 'identity';
}

function shouldInspectHtml(req: TidewaveRequest, config: TidewaveConfig): boolean {
  if (config.toolbar === false) return false;
  if (req.method === 'HEAD') return false;

  const accept = firstHeaderValue(req.headers.accept);
  const fetchDest = firstHeaderValue(req.headers['sec-fetch-dest']);

  return accept?.includes('text/html') === true || fetchDest === 'document';
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function writeHeadHeaders(args: unknown[]): unknown {
  if (typeof args[1] === 'string') return args[2];
  return args[1] || args[2];
}

function headerValue(headers: unknown, name: string): HeaderValue | undefined {
  if (Array.isArray(headers)) {
    for (let index = 0; index < headers.length - 1; index += 2) {
      if (String(headers[index]).toLowerCase() === name) {
        return headers[index + 1] as HeaderValue;
      }
    }

    return undefined;
  }

  if (headers && typeof headers === 'object') {
    for (const [header, value] of Object.entries(headers as HeaderMap)) {
      if (header.toLowerCase() === name) return value;
    }
  }

  return undefined;
}

function removeContentLengthFromHeaders(headers: unknown): void {
  if (Array.isArray(headers)) {
    for (let index = 0; index < headers.length - 1; index += 2) {
      if (String(headers[index]).toLowerCase() === 'content-length') {
        headers.splice(index, 2);
        return;
      }
    }
  } else if (headers && typeof headers === 'object') {
    for (const header of Object.keys(headers)) {
      if (header.toLowerCase() === 'content-length') {
        delete (headers as HeaderMap)[header];
        return;
      }
    }
  }
}

function isTidewaveRequest(req: TidewaveRequest): boolean {
  const url = req.url || '';
  const pathname = url.split('?')[0] || '';

  return pathname === '/tidewave' || pathname.startsWith('/tidewave/');
}
