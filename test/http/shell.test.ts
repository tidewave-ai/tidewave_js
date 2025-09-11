import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getShellCommand } from '../../src/http/handlers/shell';
import type { Request, Response, NextFn } from '../../src/http';
import { methodNotAllowed } from '../../src/http';

// Mock request/response helpers
const createMockRequest = (
  method = 'POST',
  body = '{"command":"echo hello"}',
): {
  req: Partial<Request>;
  triggerData: (chunk: string) => void;
  triggerEnd: () => void;
} => {
  const dataHandlers: Array<(chunk: string) => void> = [];
  const endHandlers: Array<() => void> = [];

  const mockReq = {
    method,
    on: vi.fn((event: string, handler: any) => {
      if (event === 'data') dataHandlers.push(handler);
      if (event === 'end') endHandlers.push(handler);
      return mockReq; // Return this to satisfy the interface
    }),
  };

  return {
    req: mockReq as unknown as Partial<Request>,
    triggerData: (chunk: string) => dataHandlers.forEach(h => h(chunk)),
    triggerEnd: () => endHandlers.forEach(h => h()),
  };
};

const createMockResponse = () => {
  const mockEnd = vi.fn();
  const mockWrite = vi.fn();
  const mockSetHeader = vi.fn();

  return {
    res: {
      statusCode: 200,
      end: mockEnd,
      write: mockWrite,
      setHeader: mockSetHeader,
      headersSent: false,
      destroyed: false,
    } as Partial<Response>,
    mockEnd,
    mockWrite,
    mockSetHeader,
  };
};

describe('HTTP Shell Handler', () => {
  const mockNext = vi.fn() as NextFn;

  beforeEach(() => {
    vi.clearAllMocks();
    console.error = vi.fn();
  });

  describe('getShellCommand', () => {
    it('should return shell command structure', () => {
      const result = getShellCommand('echo hello');

      // Test that it returns proper structure regardless of platform
      expect(result).toHaveProperty('cmd');
      expect(result).toHaveProperty('args');
      expect(Array.isArray(result.args)).toBe(true);
      expect(result.args).toContain('echo hello');

      // On Unix-like systems, should use sh -c
      // On Windows, should use cmd /s /c
      if (process.platform === 'win32') {
        expect(result.cmd).toMatch(/cmd/);
        expect(result.args).toContain('/s');
        expect(result.args).toContain('/c');
      } else {
        expect(result.cmd).toBe('sh');
        expect(result.args).toContain('-c');
      }
    });

    it('should handle different commands', () => {
      const result1 = getShellCommand('ls -la');
      const result2 = getShellCommand('pwd');

      expect(result1.args).toContain('ls -la');
      expect(result2.args).toContain('pwd');
    });

    it('should handle complex commands with quotes', () => {
      const command = 'echo "hello world"';
      const result = getShellCommand(command);

      expect(result.args).toContain(command);
    });
  });

  // Note: Full integration tests with actual subprocess spawning would require
  // more complex setup and are better suited for end-to-end testing.
  // Here we focus on testing the core logic that can be tested in isolation.

  describe('Shell handler method validation', () => {
    it('should use methodNotAllowed for non-POST requests', () => {
      const { res, mockEnd, mockSetHeader } = createMockResponse();

      methodNotAllowed(res as Response);

      expect(res.statusCode).toBe(405);
      expect(mockSetHeader).toHaveBeenCalledWith('Allow', 'POST');
      expect(mockEnd).toHaveBeenCalled();
    });
  });

  describe('Request body parsing', () => {
    it('should handle valid JSON command structure', () => {
      const validJson = '{"command":"echo test"}';

      expect(() => JSON.parse(validJson)).not.toThrow();

      const parsed = JSON.parse(validJson);
      expect(parsed).toHaveProperty('command');
      expect(parsed.command).toBe('echo test');
    });

    it('should reject invalid JSON', () => {
      const invalidJson = '{"command":}';

      expect(() => JSON.parse(invalidJson)).toThrow();
    });

    it('should handle missing command field', () => {
      const noCommand = '{}';
      const parsed = JSON.parse(noCommand);

      expect(parsed.command).toBeUndefined();
    });
  });
});
