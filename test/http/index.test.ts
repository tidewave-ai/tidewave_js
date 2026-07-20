import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TidewaveRequest, TidewaveResponse } from '../../src/http/types';
import { handleMcp } from '../../src/http/handlers/mcp';
import { createHandleConfig } from '../../src/http/handlers/config';
import { createHandleAppHtml, createHandleHtml } from '../../src/http/handlers/html';

// Mock request/response helpers
const createMockRequest = (headers: Record<string, string> = {}): Partial<TidewaveRequest> => ({
  socket: { remoteAddress: '127.0.0.1' } as any,
  headers,
});

const createMockResponse = () => {
  const headers = new Map<string, number | string | string[]>();
  const mockEnd = vi.fn();
  const mockWrite = vi.fn();
  let res: Partial<TidewaveResponse>;
  const mockSetHeader = vi.fn((name: string, value: number | string | string[]) => {
    headers.set(name.toLowerCase(), value);
    return res;
  });
  const mockGetHeader = vi.fn((name: string) => headers.get(name.toLowerCase()));
  const mockRemoveHeader = vi.fn((name: string) => {
    headers.delete(name.toLowerCase());
  });
  const mockWriteHead = vi.fn();

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
      expect(JSON.parse(mockEnd.mock.calls[0]![0])).toMatchObject({
        project_name: 'test_app',
        framework_type: 'vite',
        local_port: 5173,
        tmp_dir: 'custom-tmp',
      });
    });
  });
});
