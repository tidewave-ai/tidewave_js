import { describe, it, expect, vi, beforeEach } from 'vitest';
import { methodNotAllowed } from '../../src/http';
import type { Response } from '../../src/http';

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
});
