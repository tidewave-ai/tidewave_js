import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import type { TidewaveConfig } from '../../core';
import type { TidewaveHandler, TidewaveNext, TidewaveRequest, TidewaveResponse } from '../types';
import { magicByteType } from '../magic-bytes';

const MAX_UPLOAD_SIZE = 200_000_000;
const ALLOWED_UPLOAD_CONTENT_TYPES = ['image/png', 'image/jpeg', 'video/webm'] as const;
const ALLOWED_UPLOAD_TYPES = ['screenshot', 'recording'] as const;
const ALLOWED_UPLOAD_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webm'] as const;
const INVALID_UPLOAD = 'Bad Request: missing or invalid file parameter';
const INVALID_UPLOAD_ORIGIN =
  "For security reasons, this page only allows connections from the application's own origin.";

class InvalidUploadError extends Error {}

interface UploadedFile {
  readonly name: string;
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface UploadFormData {
  get(name: string): unknown;
}

export function createHandleUpload(config: TidewaveConfig): TidewaveHandler {
  return async function handleUpload(
    req: TidewaveRequest,
    res: TidewaveResponse,
    next: TidewaveNext,
  ): Promise<void> {
    try {
      if (req.method !== 'POST') {
        notFound(res);
        return;
      }

      if (!requireSameOrigin(req, res, config)) return;
      if (uploadTooLarge(req)) {
        badRequest(res);
        return;
      }

      const formData = await parseFormData(req);
      const type = formData.get('type');
      const file = formData.get('file');

      if (!isAllowedUploadType(type) || !isUploadedFile(file)) {
        badRequest(res);
        return;
      }

      const buffer = Buffer.from(await file.arrayBuffer());

      if (!isAllowedUpload(file, buffer)) {
        badRequest(res);
        return;
      }

      const destination = uploadPath(config, type, file.name);
      if (!destination) {
        badRequest(res);
        return;
      }

      await mkdir(uploadDir(config, type), { recursive: true });
      await writeFile(destination, buffer);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'ok', path: destination }));
    } catch (err) {
      if (err instanceof InvalidUploadError) {
        badRequest(res);
        return;
      }

      console.error(`[Tidewave] Failed to handle upload: ${err}`);

      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal server error');
      }

      next(err);
    }
  };
}

function requireSameOrigin(
  req: TidewaveRequest,
  res: TidewaveResponse,
  config: TidewaveConfig,
): boolean {
  const origin = firstHeaderValue(req.headers.origin);
  if (!origin) return true;

  if (allowedOriginHosts(config).includes(originHost(origin))) return true;

  console.warn(INVALID_UPLOAD_ORIGIN);
  res.statusCode = 403;
  res.end(INVALID_UPLOAD_ORIGIN);
  return false;
}

function originHost(origin: string): string {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function allowedOriginHosts(config: TidewaveConfig): string[] {
  // Do not derive this from the request Host header. Host is client-controlled,
  // while configured origin hosts avoid accepting DNS rebinding requests.
  return (config.allowedOrigins || []).map(originOrHostToHost).filter(host => host.length > 0);
}

function originOrHostToHost(originOrHost: string): string {
  if (originOrHost.startsWith('//')) {
    return originHost(`http:${originOrHost}`);
  }

  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(originOrHost)) {
    return originHost(originOrHost);
  }

  if (originOrHost.startsWith('[')) {
    const end = originOrHost.indexOf(']');
    return end === -1 ? originOrHost.toLowerCase() : originOrHost.slice(1, end).toLowerCase();
  }

  try {
    const parsed = new URL(`http://${originOrHost}`);
    return parsed.hostname.toLowerCase();
  } catch {
    return originOrHost.toLowerCase();
  }
}

function uploadTooLarge(req: TidewaveRequest): boolean {
  const contentLength = firstHeaderValue(req.headers['content-length']);
  if (!contentLength) return false;

  const size = Number(contentLength);
  return Number.isFinite(size) && size > MAX_UPLOAD_SIZE;
}

async function parseFormData(req: TidewaveRequest): Promise<UploadFormData> {
  const body = await readRequestBody(req);
  const request = new Request(requestUrl(req), {
    method: req.method,
    headers: requestHeaders(req),
    body: toArrayBuffer(body),
  });

  try {
    return await request.formData();
  } catch {
    throw new InvalidUploadError(INVALID_UPLOAD);
  }
}

async function readRequestBody(req: TidewaveRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;

    if (size > MAX_UPLOAD_SIZE) {
      throw new InvalidUploadError(INVALID_UPLOAD);
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return arrayBuffer;
}

function requestUrl(req: TidewaveRequest): string {
  const host = firstHeaderValue(req.headers.host) || 'localhost';
  return `http://${host}${req.url || '/'}`;
}

function requestHeaders(req: TidewaveRequest): Headers {
  const headers = new Headers();

  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }

  return headers;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function isAllowedUploadType(type: unknown): type is (typeof ALLOWED_UPLOAD_TYPES)[number] {
  return typeof type === 'string' && isOneOf(ALLOWED_UPLOAD_TYPES, type);
}

function isUploadedFile(file: unknown): file is UploadedFile {
  if (typeof file !== 'object' || file === null) return false;

  const candidate = file as Partial<UploadedFile>;
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.arrayBuffer === 'function'
  );
}

function isAllowedUpload(file: UploadedFile, buffer: Buffer): boolean {
  const [contentType] = file.type.split(';');

  return (
    isOneOf(ALLOWED_UPLOAD_CONTENT_TYPES, contentType || '') &&
    magicByteType(buffer.subarray(0, 128)) !== 'unknown'
  );
}

function uploadDir(config: TidewaveConfig, type: (typeof ALLOWED_UPLOAD_TYPES)[number]): string {
  return path.join(tmpDir(config), 'tidewave', folderForType(type));
}

function uploadPath(
  config: TidewaveConfig,
  type: (typeof ALLOWED_UPLOAD_TYPES)[number],
  filename: string,
): string | null {
  if (!/^[A-Za-z0-9_.-]+$/.test(filename)) return null;

  const ext = path.extname(filename).toLowerCase();
  if (!isOneOf(ALLOWED_UPLOAD_EXTENSIONS, ext)) return null;

  return path.join(uploadDir(config, type), filename);
}

function isOneOf<const T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value);
}

function tmpDir(config: TidewaveConfig): string {
  return config.tmpDir || 'tmp';
}

function folderForType(type: (typeof ALLOWED_UPLOAD_TYPES)[number]): string {
  switch (type) {
    case 'screenshot':
      return 'screenshots';
    case 'recording':
      return 'recordings';
  }
}

function badRequest(res: TidewaveResponse): void {
  res.statusCode = 400;
  res.end(INVALID_UPLOAD);
}

function notFound(res: TidewaveResponse): void {
  res.statusCode = 404;
  res.end('Not Found');
}
