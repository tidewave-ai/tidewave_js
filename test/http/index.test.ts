import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TidewaveRequest, TidewaveResponse } from '../../src/http/types';
import { handleMcp } from '../../src/http/handlers/mcp';
import { createHandleConfig } from '../../src/http/handlers/config';
import { createHandleAppHtml, createHandleHtml } from '../../src/http/handlers/html';
import { createHandleResponseHeaders } from '../../src/http/headers';

// Mock request/response helpers
const createMockRequest = (headers: Record<string, string> = {}): Partial<TidewaveRequest> => ({
  socket: { remoteAddress: '127.0.0.1' } as any,
  headers,
});

const createMockResponse = () => {
  const headers = new Map<string, number | string | string[]>();
  let res: Partial<TidewaveResponse>;
  const mockEnd = vi.fn((..._args: unknown[]) => res as TidewaveResponse);
  const mockWrite = vi.fn((..._args: unknown[]) => true);
  const mockSetHeader = vi.fn((name: string, value: number | string | string[]) => {
    headers.set(name.toLowerCase(), value);
    return res;
  });
  const mockGetHeader = vi.fn((name: string) => headers.get(name.toLowerCase()));
  const mockRemoveHeader = vi.fn((name: string) => {
    headers.delete(name.toLowerCase());
  });
  const mockWriteHead = vi.fn((..._args: unknown[]) => res as TidewaveResponse);

  res = {
    statusCode: 200,
    end: mockEnd,
    write: mockWrite,
    setHeader: mockSetHeader,
    getHeader: mockGetHeader,
    removeHeader: mockRemoveHeader,
    writeHead: mockWriteHead,
    headersSent: false,
    destroyed: false,
  } as Partial<TidewaveResponse>;

  return {
    res,
    mockEnd,
    mockWrite,
    mockSetHeader,
    mockGetHeader,
    mockRemoveHeader,
    mockWriteHead,
  };
};

describe('HTTP Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    console.warn = vi.fn();
    console.error = vi.fn();
  });

  describe('handleMcp', () => {
    it('should return 403 if origin header is set', async () => {
      const req = createMockRequest({ origin: 'http://localhost:4000' });
      const { res, mockEnd } = createMockResponse();
      const next = vi.fn();

      await handleMcp(req as TidewaveRequest, res as TidewaveResponse, next);

      expect(res.statusCode).toBe(403);
      expect(mockEnd).toHaveBeenCalledWith(expect.stringContaining('origin'));
    });

    it('should return 405 for non-POST requests', async () => {
      const req = { ...createMockRequest(), method: 'GET' };
      const { res, mockEnd, mockSetHeader } = createMockResponse();
      const next = vi.fn();

      await handleMcp(req as TidewaveRequest, res as TidewaveResponse, next);

      expect(res.statusCode).toBe(405);
      expect(mockSetHeader).toHaveBeenCalledWith('Allow', 'POST');
      expect(mockEnd).toHaveBeenCalled();
    });
  });

  describe('handleHtml', () => {
    it('should allow arbitrary origin headers for the root page', async () => {
      const req = { ...createMockRequest({ origin: 'http://example.com' }), url: '/' };
      const { res, mockEnd, mockSetHeader } = createMockResponse();
      const next = vi.fn();

      const handler = createHandleHtml({});
      await handler(req as TidewaveRequest, res as TidewaveResponse, next);

      expect(res.statusCode).toBe(200);
      expect(mockSetHeader).toHaveBeenCalledWith('Content-Type', 'text/html');
      expect(mockEnd).toHaveBeenCalledWith(expect.stringContaining('<html>'));
      expect(mockEnd).toHaveBeenCalledWith(expect.stringContaining('/tc/tc.js'));
      expect(next).not.toHaveBeenCalled();
    });

    it('should serve the entrypoint page even when an entrypoint query parameter is given', async () => {
      const req = { ...createMockRequest(), url: '/tidewave?entrypoint=foo' };
      const { res, mockEnd } = createMockResponse();
      const next = vi.fn();

      const handler = createHandleHtml({});
      await handler(req as TidewaveRequest, res as TidewaveResponse, next);

      expect(res.statusCode).toBe(200);
      expect(mockEnd).toHaveBeenCalledWith(expect.stringContaining('/tc/tc.js'));
      expect(mockEnd).not.toHaveBeenCalledWith(expect.stringContaining('/tc/control.js'));
      expect(next).not.toHaveBeenCalled();
    });

    it('should serve the control app with a content security policy', async () => {
      const req = { ...createMockRequest(), url: '/tidewave/app' };
      const { res, mockEnd, mockSetHeader } = createMockResponse();
      const next = vi.fn();

      const handler = createHandleAppHtml({});
      await handler(req as TidewaveRequest, res as TidewaveResponse, next);

      expect(res.statusCode).toBe(200);
      expect(mockSetHeader).toHaveBeenCalledWith('Content-Type', 'text/html');
      expect(mockSetHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        "base-uri 'self'; frame-ancestors 'self';",
      );
      expect(mockEnd).toHaveBeenCalledWith(expect.stringContaining('/tc/control.js'));
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('handleConfig', () => {
    it('should allow origin header and return CORS config', async () => {
      const req = createMockRequest({ origin: 'http://localhost:4001' });
      const { res, mockEnd, mockSetHeader } = createMockResponse();
      const next = vi.fn();

      const handler = createHandleConfig(
        {
          framework: 'vite',
          projectName: 'test_app',
          tmpDir: 'custom-tmp',
        },
        () => 5173,
      );
      await handler(req as TidewaveRequest, res as TidewaveResponse, next);

      expect(res.statusCode).toBe(200);
      expect(mockSetHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(mockSetHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
      expect(JSON.parse(String(mockEnd.mock.calls[0]![0]))).toMatchObject({
        project_name: 'test_app',
        framework_type: 'vite',
        local_port: 5173,
        tmp_dir: 'custom-tmp',
      });
    });
  });

  describe('handleResponseHeaders', () => {
    it('should stream HTML writes and inject the toolbar when the closing head is seen', async () => {
      const req = {
        ...createMockRequest({ accept: 'text/html' }),
        url: '/',
      };
      const { res, mockEnd, mockWrite } = createMockResponse();
      const next = vi.fn();

      const handler = createHandleResponseHeaders(
        { clientUrl: 'http://localhost:4000' },
        () => 5173,
      );
      const response = res as TidewaveResponse;
      await handler(req as TidewaveRequest, response, next);

      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      const firstWrite = response.write('<html><head><title>App</title>');

      expect(firstWrite).toBe(true);
      expect(next).toHaveBeenCalledOnce();
      expect(mockWrite).toHaveBeenCalledWith('<html><head><title>App</title>');
      expect(mockEnd).not.toHaveBeenCalled();

      response.write('</head><body>Hello');
      response.write('</body>');
      response.end('</html>');

      expect(mockWrite).toHaveBeenCalledTimes(3);
      expect(mockWrite.mock.calls[2]![0]).toBe('</body>');
      expect(mockEnd).toHaveBeenCalledWith('</html>');

      const injectedChunk = String(mockWrite.mock.calls[1]![0]);
      expect(injectedChunk).toContain('name="tidewave:config"');
      expect(injectedChunk).toContain('http://localhost:4000/tc/toolbar.js');
      expect(injectedChunk.indexOf('/tc/toolbar.js')).toBeLessThan(
        injectedChunk.indexOf('</head>'),
      );
    });

    it('should still inject the toolbar into an HTML response completed with end', async () => {
      const req = {
        ...createMockRequest({ accept: 'text/html' }),
        url: '/',
      };
      const { res, mockEnd, mockRemoveHeader, mockWrite } = createMockResponse();
      const next = vi.fn();

      const handler = createHandleResponseHeaders({});
      const response = res as TidewaveResponse;
      await handler(req as TidewaveRequest, response, next);

      response.setHeader('Content-Type', 'text/html');
      response.setHeader('Content-Length', '39');
      response.end('<html><head></head><body></body></html>');

      expect(mockWrite).not.toHaveBeenCalled();
      expect(mockRemoveHeader).toHaveBeenCalledWith('content-length');
      expect(String(mockEnd.mock.calls[0]![0])).toContain('/tc/toolbar.js');
    });

    it('should inspect HTML headers passed through writeHead', async () => {
      const req = {
        ...createMockRequest({ accept: 'text/html' }),
        url: '/',
      };
      const { res, mockWrite, mockWriteHead } = createMockResponse();
      const next = vi.fn();
      const headers = {
        'Content-Type': 'text/html',
        'Content-Length': '39',
      };

      const handler = createHandleResponseHeaders({});
      const response = res as TidewaveResponse;
      await handler(req as TidewaveRequest, response, next);

      response.writeHead(200, headers);
      response.write('<html><head></head>');

      expect(headers).not.toHaveProperty('Content-Length');
      expect(mockWriteHead).toHaveBeenCalledWith(200, headers);
      expect(String(mockWrite.mock.calls[0]![0])).toContain('/tc/toolbar.js');
    });

    it('should pass non-HTML writes through without injecting', async () => {
      const req = {
        ...createMockRequest({ accept: 'text/html' }),
        url: '/',
      };
      const { res, mockEnd, mockRemoveHeader, mockWrite } = createMockResponse();
      const next = vi.fn();

      const handler = createHandleResponseHeaders({});
      const response = res as TidewaveResponse;
      await handler(req as TidewaveRequest, response, next);

      response.setHeader('Content-Type', 'text/plain');
      response.write('hello');
      response.end('world');

      expect(mockWrite).toHaveBeenCalledWith('hello');
      expect(mockEnd).toHaveBeenCalledWith('world');
      expect(mockRemoveHeader).not.toHaveBeenCalled();
    });
  });
});
