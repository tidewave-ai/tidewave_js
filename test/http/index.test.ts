import { describe, it, expect, vi, beforeEach } from 'vitest';
import { methodNotAllowed, decodeBody } from '../../src/http';
import type { Request, Response } from '../../src/http';

// Mock request/response helpers
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

const createMockRequest = (): {
  req: Partial<Request>;
  triggerData: (chunk: string) => void;
  triggerEnd: () => void;
  triggerError: (error: Error) => void;
} => {
  const dataHandlers: Array<(chunk: string) => void> = [];
  const endHandlers: Array<() => void> = [];
  const errorHandlers: Array<(error: Error) => void> = [];

  const mockReq = {
    on: vi.fn((event: string, handler: any) => {
      if (event === 'data') dataHandlers.push(handler);
      if (event === 'end') endHandlers.push(handler);
      if (event === 'error') errorHandlers.push(handler);
      return mockReq; // Return this to satisfy the interface
    }),
  };

  return {
    req: mockReq as unknown as Partial<Request>,
    triggerData: (chunk: string) => dataHandlers.forEach(h => h(chunk)),
    triggerEnd: () => endHandlers.forEach(h => h()),
    triggerError: (error: Error) => errorHandlers.forEach(h => h(error)),
  };
};

describe('HTTP Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  describe('decodeBody', () => {
    it('should decode valid JSON body', async () => {
      const { req, triggerData, triggerEnd } = createMockRequest();
      const jsonData = { command: 'test', value: 42 };

      const promise = decodeBody(req as Request);

      triggerData(JSON.stringify(jsonData));
      triggerEnd();

      const result = await promise;
      expect(result).toEqual(jsonData);
    });

    it('should handle empty body', async () => {
      const { req, triggerEnd } = createMockRequest();

      const promise = decodeBody(req as Request);

      triggerEnd();

      const result = await promise;
      expect(result).toEqual({});
    });

    it('should handle body received in multiple chunks', async () => {
      const { req, triggerData, triggerEnd } = createMockRequest();
      const jsonData = { message: 'hello world', numbers: [1, 2, 3] };
      const jsonString = JSON.stringify(jsonData);

      const promise = decodeBody(req as Request);

      // Send data in multiple chunks
      const chunk1 = jsonString.slice(0, 10);
      const chunk2 = jsonString.slice(10, 20);
      const chunk3 = jsonString.slice(20);

      triggerData(chunk1);
      triggerData(chunk2);
      triggerData(chunk3);
      triggerEnd();

      const result = await promise;
      expect(result).toEqual(jsonData);
    });

    it('should handle non-ASCII characters', async () => {
      const { req, triggerData, triggerEnd } = createMockRequest();
      const jsonData = { message: 'héllo wörld', emoji: '🚀' };

      const promise = decodeBody(req as Request);

      triggerData(JSON.stringify(jsonData));
      triggerEnd();

      const result = await promise;
      expect(result).toEqual(jsonData);
    });

    it('should reject invalid JSON', async () => {
      const { req, triggerData, triggerEnd } = createMockRequest();

      const promise = decodeBody(req as Request);

      triggerData('invalid json {');
      triggerEnd();

      await expect(promise).rejects.toThrow();
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to parse body'));
    });

    it('should reject malformed JSON', async () => {
      const { req, triggerData, triggerEnd } = createMockRequest();

      const promise = decodeBody(req as Request);

      triggerData('{"incomplete": true,}'); // trailing comma
      triggerEnd();

      await expect(promise).rejects.toThrow();
    });

    it('should handle nested objects', async () => {
      const { req, triggerData, triggerEnd } = createMockRequest();
      const complexData = {
        command: {
          name: 'test',
          args: ['--verbose', '--output=json'],
          options: {
            timeout: 5000,
            retry: true,
          },
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: '1.0.0',
        },
      };

      const promise = decodeBody(req as Request);

      triggerData(JSON.stringify(complexData));
      triggerEnd();

      const result = await promise;
      expect(result).toEqual(complexData);
    });

    it('should handle arrays', async () => {
      const { req, triggerData, triggerEnd } = createMockRequest();
      const arrayData = {
        commands: ['ls', 'pwd', 'whoami'],
        ports: [3000, 5173, 8080],
      };

      const promise = decodeBody(req as Request);

      triggerData(JSON.stringify(arrayData));
      triggerEnd();

      const result = await promise;
      expect(result).toEqual(arrayData);
    });

    it('should handle null and boolean values', async () => {
      const { req, triggerData, triggerEnd } = createMockRequest();
      const dataWithNulls = {
        enabled: true,
        disabled: false,
        value: null,
        count: 0,
        name: '',
      };

      const promise = decodeBody(req as Request);

      triggerData(JSON.stringify(dataWithNulls));
      triggerEnd();

      const result = await promise;
      expect(result).toEqual(dataWithNulls);
    });

    it('should handle very large payloads', async () => {
      const { req, triggerData, triggerEnd } = createMockRequest();

      // Create a large object
      const largeData = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `item-${i}`,
          data: 'x'.repeat(100),
        })),
      };

      const promise = decodeBody(req as Request);

      triggerData(JSON.stringify(largeData));
      triggerEnd();

      const result = await promise;
      expect(result).toEqual(largeData);
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items).toHaveLength(1000);
    });

    it('should preserve number precision', async () => {
      const { req, triggerData, triggerEnd } = createMockRequest();
      const numericData = {
        integer: 42,
        float: 3.14159,
        large: 9007199254740991, // MAX_SAFE_INTEGER
        small: 0.000001,
        negative: -273.15,
      };

      const promise = decodeBody(req as Request);

      triggerData(JSON.stringify(numericData));
      triggerEnd();

      const result = await promise;
      expect(result).toEqual(numericData);
    });
  });
});
