import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkRemoteIp,
  checkOrigin,
  isLocalIp,
  parseUrl,
  isOriginAllowed,
  getDefaultAllowedOrigins,
} from '../../src/http/security';
import type { Request, Response } from '../../src/http';
import type { TidewaveConfig } from '../../src/config-loader';

// Mock request/response helpers
const createMockRequest = (remoteAddress = '127.0.0.1', origin?: string): Partial<Request> => ({
  socket: { remoteAddress } as any,
  headers: origin ? { origin } : {},
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

  describe('parseUrl', () => {
    it('should parse complete URLs', () => {
      const result = parseUrl('https://example.com:8080');
      expect(result).toEqual({
        scheme: 'https',
        host: 'example.com',
        port: 8080,
      });
    });

    it('should parse URLs without port', () => {
      const result = parseUrl('http://localhost');
      expect(result).toEqual({
        scheme: 'http',
        host: 'localhost',
        port: undefined,
      });
    });

    it('should handle protocol-relative URLs', () => {
      const result = parseUrl('//example.com');
      expect(result).toEqual({
        scheme: undefined,
        host: 'example.com',
        port: undefined,
      });
    });

    it('should return null for invalid URLs', () => {
      expect(parseUrl('not-a-url')).toBe(null);
      expect(parseUrl('')).toBe(null);
    });
  });

  describe('isOriginAllowed', () => {
    it('should match exact origins', () => {
      const origin = parseUrl('https://example.com:8080');
      const allowed = parseUrl('https://example.com:8080');

      expect(isOriginAllowed(origin, allowed)).toBe(true);
    });

    it('should handle scheme flexibility', () => {
      const origin = parseUrl('https://example.com');
      const allowed = parseUrl('//example.com'); // no scheme specified

      expect(isOriginAllowed(origin, allowed)).toBe(true);
    });

    it('should handle port flexibility', () => {
      const origin = parseUrl('https://example.com:443');
      const allowed = parseUrl('https://example.com'); // no port specified

      expect(isOriginAllowed(origin, allowed)).toBe(true);
    });

    it('should support wildcard domains', () => {
      const origin1 = parseUrl('https://sub.example.com');
      const origin2 = parseUrl('https://example.com');
      const allowed = { scheme: 'https' as const, host: '*.example.com', port: undefined };

      expect(isOriginAllowed(origin1, allowed)).toBe(true);
      expect(isOriginAllowed(origin2, allowed)).toBe(true);
    });

    it('should reject mismatched origins', () => {
      const origin = parseUrl('https://evil.com');
      const allowed = parseUrl('https://example.com');

      expect(isOriginAllowed(origin, allowed)).toBe(false);
    });

    it('should handle null inputs', () => {
      expect(isOriginAllowed(null, null)).toBe(false);
      expect(isOriginAllowed(parseUrl('https://example.com'), null)).toBe(false);
      expect(isOriginAllowed(null, parseUrl('https://example.com'))).toBe(false);
    });
  });

  describe('getDefaultAllowedOrigins', () => {
    it('should generate default origins from Vite config', () => {
      const config: TidewaveConfig = { host: 'localhost', port: 3000 };

      const origins = getDefaultAllowedOrigins(config);

      expect(origins).toEqual(['http://localhost:3000', 'https://localhost:3000']);
    });
  });

  describe('checkOrigin', () => {
    it('should allow requests without origin header', () => {
      const req = createMockRequest('127.0.0.1'); // no origin
      const { res } = createMockResponse();
      const config: TidewaveConfig = { port: 5173, host: 'localhost' };

      const result = checkOrigin(req as Request, res as Response, config);

      expect(result).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('should allow default Vite dev server origin', () => {
      const req = createMockRequest('127.0.0.1', 'http://localhost:5173');
      const { res } = createMockResponse();
      const config: TidewaveConfig = { host: 'localhost', port: 5173 };

      const result = checkOrigin(req as Request, res as Response, config);

      expect(result).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('should allow custom allowed origins', () => {
      const req = createMockRequest('127.0.0.1', 'https://custom.example.com');
      const { res } = createMockResponse();
      const config: TidewaveConfig = {
        allowedOrigins: ['https://custom.example.com'],
        host: 'localhost',
        port: 5173,
      };

      const result = checkOrigin(req as Request, res as Response, config);

      expect(result).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('should block unauthorized origins', () => {
      const req = createMockRequest('127.0.0.1', 'https://evil.com');
      const { res, mockEnd } = createMockResponse();
      const config: TidewaveConfig = { host: 'localhost', port: 5173 };

      const result = checkOrigin(req as Request, res as Response, config);

      expect(result).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(mockEnd).toHaveBeenCalledWith(expect.stringContaining('security reasons'));
    });

    it('should handle invalid origin header', () => {
      const req = createMockRequest('127.0.0.1', 'not-a-url');
      const { res, mockEnd } = createMockResponse();
      const config: TidewaveConfig = { host: 'localhost', port: 5173 };

      const result = checkOrigin(req as Request, res as Response, config);

      expect(result).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(mockEnd).toHaveBeenCalledWith(expect.stringContaining('Invalid origin'));
    });
  });
});
