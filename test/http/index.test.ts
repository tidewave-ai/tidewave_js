import { describe, it, expect, vi, beforeEach } from 'vitest';
import { methodNotAllowed } from '../../src/http';
import type { Request, Response } from '../../src/http';
import { handleMcp } from '../../src/http/handlers/mcp';
import { createHandleConfig } from '../../src/http/handlers/config';

// Mock request/response helpers
const createMockRequest = (headers: Record<string, string> = {}): Partial<Request> => ({
  socket: { remoteAddress: '127.0.0.1' } as any,
  headers,
});

const createMockResponse = () => {
  const mockEnd = vi.fn();
  const mockSetHeader = vi.fn();

  return {
    res: {
      statusCode: 200,
      end: mockEnd,
      setHeader: mockSetHeader,
      headersSent: false,
      destroyed: false,
    } as Partial<Response>,
    mockEnd,
    mockSetHeader,
  };
};

describe('HTTP Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    console.warn = vi.fn();
    console.error = vi.fn();
  });

  describe('methodNotAllowed', () => {
    it('should set correct status code and headers', () => {
      const { res, mockEnd, mockSetHeader } = createMockResponse();

      methodNotAllowed(res as Response);

      expect(res.statusCode).toBe(405);
      expect(mockSetHeader).toHaveBeenCalledWith('Allow', 'POST');
      expect(mockEnd).toHaveBeenCalled();
    });

    it('should return undefined', () => {
      const { res } = createMockResponse();

      const result = methodNotAllowed(res as Response);

      expect(result).toBeUndefined();
    });
  });

  describe('handleMcp', () => {
    it('should return 403 if origin header is set', async () => {
      const req = createMockRequest({ origin: 'http://localhost:4000' });
      const { res, mockEnd } = createMockResponse();
      const next = vi.fn();

      await handleMcp(req as Request, res as Response, next);

      expect(res.statusCode).toBe(403);
      expect(mockEnd).toHaveBeenCalledWith(expect.stringContaining('origin'));
    });
  });

  describe('handleConfig', () => {
    it('should return 403 if origin header is set', async () => {
      const req = createMockRequest({ origin: 'http://localhost:4000' });
      const { res, mockEnd } = createMockResponse();
      const next = vi.fn();

      const handler = createHandleConfig({});
      await handler(req as Request, res as Response, next);

      expect(res.statusCode).toBe(403);
      expect(mockEnd).toHaveBeenCalledWith(expect.stringContaining('origin'));
    });
  });
});
