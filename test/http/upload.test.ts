import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandleUpload } from '../../src/http/handlers/upload';
import { magicByteType } from '../../src/http/magic-bytes';
import type { TidewaveRequest, TidewaveResponse } from '../../src/http/types';

const INVALID_UPLOAD = 'Bad Request: missing or invalid file parameter';

const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const validJpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.from('JFIF'), 0xff, 0xd9]);
const validWebm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...Buffer.from('doctypewebm')]);

function createMockResponse() {
  const mockEnd = vi.fn();
  const mockSetHeader = vi.fn();

  return {
    res: {
      statusCode: 200,
      end: mockEnd,
      setHeader: mockSetHeader,
      headersSent: false,
      destroyed: false,
    } as Partial<TidewaveResponse>,
    mockEnd,
    mockSetHeader,
  };
}

function multipartUploadRequest({
  type = 'screenshot',
  filename = 'capture.png',
  contentType = 'image/png',
  content = validPng,
  origin,
  host = 'example.test:3000',
  contentLength,
}: {
  type?: string;
  filename?: string;
  contentType?: string;
  content?: Buffer | string;
  origin?: string;
  host?: string;
  contentLength?: string;
} = {}): TidewaveRequest {
  const boundary = '----tidewave-test-boundary';
  const fileContent = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\n${type}\r\n`),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    fileContent,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const req = Readable.from(body) as unknown as TidewaveRequest;
  req.method = 'POST';
  req.url = '/tidewave/upload';
  req.headers = {
    host,
    'content-type': `multipart/form-data; boundary=${boundary}`,
    'content-length': contentLength || String(body.length),
    ...(origin ? { origin } : {}),
  };
  req.socket = { remoteAddress: '127.0.0.1' } as any;

  return req;
}

describe('upload endpoint', () => {
  let tmpDirPath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    console.warn = vi.fn();
    console.error = vi.fn();
    tmpDirPath = await mkdtemp(path.join(tmpdir(), 'tidewave-js-upload-'));
  });

  afterEach(async () => {
    await rm(tmpDirPath, { recursive: true, force: true });
  });

  it('detects supported magic byte types', () => {
    expect(magicByteType(validJpg)).toBe('jpg');
    expect(magicByteType(validPng)).toBe('png');
    expect(magicByteType(validWebm)).toBe('webm');
    expect(magicByteType(Buffer.from('not an image'))).toBe('unknown');
  });

  it('accepts valid screenshots from the same origin', async () => {
    const handler = createHandleUpload({ tmpDir: tmpDirPath });
    const { res, mockEnd, mockSetHeader } = createMockResponse();
    const next = vi.fn();

    await handler(
      multipartUploadRequest({ origin: 'http://example.test:3000' }),
      res as TidewaveResponse,
      next,
    );

    const expectedPath = path.join(tmpDirPath, 'tidewave', 'screenshots', 'capture.png');

    expect(res.statusCode).toBe(200);
    expect(mockSetHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    expect(JSON.parse(mockEnd.mock.calls[0]![0])).toEqual({ status: 'ok', path: expectedPath });
    expect(await readFile(expectedPath)).toEqual(validPng);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts valid recordings without an origin header', async () => {
    const handler = createHandleUpload({ tmpDir: tmpDirPath });
    const { res, mockEnd } = createMockResponse();

    await handler(
      multipartUploadRequest({
        type: 'recording',
        filename: 'capture.webm',
        contentType: 'video/webm;codecs=vp9',
        content: validWebm,
      }),
      res as TidewaveResponse,
      vi.fn(),
    );

    const expectedPath = path.join(tmpDirPath, 'tidewave', 'recordings', 'capture.webm');

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(mockEnd.mock.calls[0]![0])).toEqual({ status: 'ok', path: expectedPath });
    expect(await readFile(expectedPath)).toEqual(validWebm);
  });

  it('rejects invalid type, content type, filename, and magic bytes', async () => {
    const invalidUploads = [
      { type: 'other', filename: 'capture.png', contentType: 'image/png', content: validPng },
      { type: 'screenshot', filename: 'capture.txt', contentType: 'text/plain', content: validPng },
      {
        type: 'screenshot',
        filename: '../capture.png',
        contentType: 'image/png',
        content: validPng,
      },
      {
        type: 'screenshot',
        filename: 'capture png.jpg',
        contentType: 'image/jpeg',
        content: validJpg,
      },
      { type: 'screenshot', filename: 'capture.gif', contentType: 'image/jpeg', content: validJpg },
      {
        type: 'screenshot',
        filename: 'capture.png',
        contentType: 'image/png',
        content: 'not an image',
      },
    ];

    for (const upload of invalidUploads) {
      const handler = createHandleUpload({ tmpDir: tmpDirPath });
      const { res, mockEnd } = createMockResponse();

      await handler(multipartUploadRequest(upload), res as TidewaveResponse, vi.fn());

      expect(res.statusCode).toBe(400);
      expect(mockEnd).toHaveBeenCalledWith(INVALID_UPLOAD);
    }
  });

  it('rejects uploads that exceed the size limit', async () => {
    const handler = createHandleUpload({ tmpDir: tmpDirPath });
    const { res, mockEnd } = createMockResponse();

    await handler(
      multipartUploadRequest({ contentLength: '200000001' }),
      res as TidewaveResponse,
      vi.fn(),
    );

    expect(res.statusCode).toBe(400);
    expect(mockEnd).toHaveBeenCalledWith(INVALID_UPLOAD);
  });

  it('rejects cross-origin upload requests', async () => {
    const handler = createHandleUpload({ tmpDir: tmpDirPath });
    const { res, mockEnd } = createMockResponse();

    await handler(
      multipartUploadRequest({
        origin: 'http://evil.test:3000',
        host: 'example.test:3000',
      }),
      res as TidewaveResponse,
      vi.fn(),
    );

    expect(res.statusCode).toBe(403);
    expect(mockEnd).toHaveBeenCalledWith(
      "For security reasons, this page only allows connections from the application's own origin.",
    );
  });
});
