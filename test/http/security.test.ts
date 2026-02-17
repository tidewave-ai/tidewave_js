import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRemoteIp, checkOrigin, isLocalIp } from '../../src/http/security';
import type { Request, Response } from '../../src/http';
import type { TidewaveConfig } from '../../src/core';

// Mock request/response helpers
const createMockRequest = (
  remoteAddress = '127.0.0.1',
  origin?: string,
  url = '/',
): Partial<Request> => ({
  socket: { remoteAddress } as any,
  headers: origin ? { origin } : {},
  url,
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

describe('HTTP Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    console.warn = vi.fn();
  });

  describe('isLocalIp', () => {
    it('should identify IPv4 localhost addresses', () => {
      expect(isLocalIp('127.0.0.1')).toBe(true);
      expect(isLocalIp('127.0.0.100')).toBe(true);
      expect(isLocalIp('127.0.0.255')).toBe(true);
    });

    it('should identify IPv6 localhost addresses', () => {
      expect(isLocalIp('::1')).toBe(true);
      expect(isLocalIp('::ffff:127.0.0.1')).toBe(true);
    });

    it('should reject remote IP addresses', () => {
      expect(isLocalIp('192.168.1.1')).toBe(false);
      expect(isLocalIp('10.0.0.1')).toBe(false);
      expect(isLocalIp('8.8.8.8')).toBe(false);
      expect(isLocalIp('2001:db8::1')).toBe(false);
    });

    it('should reject non-127.0.0.x localhost ranges', () => {
      expect(isLocalIp('127.1.2.3')).toBe(false);
      expect(isLocalIp('127.2.0.1')).toBe(false);
      expect(isLocalIp('127.255.255.255')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isLocalIp(undefined)).toBe(false);
      expect(isLocalIp('')).toBe(false);
      expect(isLocalIp('not-an-ip')).toBe(false);
    });
  });

  describe('checkRemoteIp', () => {
    it('should allow local IP addresses', () => {
      const req = createMockRequest('127.0.0.1');
      const { res } = createMockResponse();
      const config: TidewaveConfig = {};

      const result = checkRemoteIp(req as Request, res as Response, config);

      expect(result).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('should block remote IP by default', () => {
      const req = createMockRequest('192.168.1.1');
      const { res, mockEnd } = createMockResponse();
      const config: TidewaveConfig = {};

      const result = checkRemoteIp(req as Request, res as Response, config);

      expect(result).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(mockEnd).toHaveBeenCalledWith(expect.stringContaining('security reasons'));
    });

    it('should allow remote IP when allowRemoteAccess is true', () => {
      const req = createMockRequest('192.168.1.1');
      const { res } = createMockResponse();
      const config: TidewaveConfig = { allowRemoteAccess: true };

      const result = checkRemoteIp(req as Request, res as Response, config);

      expect(result).toBe(true);
      expect(res.statusCode).toBe(200);
    });
  });

  describe('checkOrigin', () => {
    it('/mcp and /config refuse requests with origin header', () => {
      // /mcp should refuse any request with origin header
      const req1 = createMockRequest('127.0.0.1', 'http://localhost:4001', '/mcp');
      const { res: res1, mockEnd: mockEnd1 } = createMockResponse();
      const config: TidewaveConfig = {};

      const result1 = checkOrigin(req1 as Request, res1 as Response, config);

      expect(result1).toBe(false);
      expect(res1.statusCode).toBe(403);

      // /config should refuse any request with origin header
      const req2 = createMockRequest('127.0.0.1', 'http://localhost:4000', '/config');
      const { res: res2, mockEnd: mockEnd2 } = createMockResponse();

      const result2 = checkOrigin(req2 as Request, res2 as Response, config);

      expect(result2).toBe(false);
      expect(res2.statusCode).toBe(403);
    });

    it('/ (root) allows any origin', () => {
      // / should allow any origin
      const req1 = createMockRequest('127.0.0.1', 'http://example.com', '/');
      const { res: res1 } = createMockResponse();
      const config: TidewaveConfig = {};

      const result1 = checkOrigin(req1 as Request, res1 as Response, config);

      expect(result1).toBe(true);
      expect(res1.statusCode).toBe(200);

      const req2 = createMockRequest('127.0.0.1', 'http://localhost:4000', '/');
      const { res: res2 } = createMockResponse();

      const result2 = checkOrigin(req2 as Request, res2 as Response, config);

      expect(result2).toBe(true);
      expect(res2.statusCode).toBe(200);
    });

    it('should allow requests without origin header', () => {
      const req = createMockRequest('127.0.0.1', undefined, '/mcp');
      const { res } = createMockResponse();
      const config: TidewaveConfig = {};

      const result = checkOrigin(req as Request, res as Response, config);

      expect(result).toBe(true);
      expect(res.statusCode).toBe(200);
    });
  });
});
