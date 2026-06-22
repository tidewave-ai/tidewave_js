import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TidewaveRequest, TidewaveResponse } from '../../src/http/types';
import { handleMcp } from '../../src/http/handlers/mcp';
import { createHandleConfig } from '../../src/http/handlers/config';

// Mock request/response helpers
const createMockRequest = (headers: Record<string, string> = {}): Partial<TidewaveRequest> => ({
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
    } as Partial<TidewaveResponse>,
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

  describe('handleConfig', () => {
    it('should allow origin header and return CORS config', async () => {
      const req = createMockRequest({ origin: 'http://localhost:4001' });
      const { res, mockEnd, mockSetHeader } = createMockResponse();
      const next = vi.fn();

      const handler = createHandleConfig(
        {
          framework: 'vite',
          projectName: 'test_app',
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
      });
    });
  });
});
