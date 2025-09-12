import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ViteDevServer } from 'vite';
import tidewave from '../src/vite-plugin';
import type { TidewaveConfig } from '../src/http';

// Mock Vite server
interface MockViteDevServer extends Partial<ViteDevServer> {
  _middlewareUse: ReturnType<typeof vi.fn>;
}

const createMockServer = (host = 'localhost', port = 5173): MockViteDevServer => {
  const middlewareUse = vi.fn();

  return {
    config: {
      server: { host, port },
    } as any,
    middlewares: {
      use: middlewareUse,
    } as any,
    _middlewareUse: middlewareUse, // Helper to access the mock
  };
};

describe('Tidewave Vite Plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Plugin Creation', () => {
    it('should create plugin with default config', () => {
      const plugin = tidewave();

      expect(plugin.name).toBe('vite-plugin-tidewave');
      expect(plugin.configureServer).toBeDefined();
      expect(typeof plugin.configureServer).toBe('function');
    });

    it('should create plugin with custom config', () => {
      const config: TidewaveConfig = {
        allowRemoteAccess: true,
        allowedOrigins: ['https://example.com'],
      };

      const plugin = tidewave(config);

      expect(plugin.name).toBe('vite-plugin-tidewave');
      expect(plugin.configureServer).toBeDefined();
    });

    it('should handle empty config object', () => {
      const plugin = tidewave({});

      expect(plugin.name).toBe('vite-plugin-tidewave');
    });

    it('should handle undefined config', () => {
      const plugin = tidewave(undefined as any);

      expect(plugin.name).toBe('vite-plugin-tidewave');
    });
  });

  describe('Server Configuration', () => {
    it('should register middleware on server configuration', () => {
      const mockServer = createMockServer();
      const plugin = tidewave();

      (plugin.configureServer as any)(mockServer);

      const middlewareUse = (mockServer as any)._middlewareUse;

      // Should register 4 middleware: security + decode body + mcp + shell routes
      expect(middlewareUse).toHaveBeenCalledTimes(4);

      // Global security middleware
      expect(middlewareUse).toHaveBeenCalledWith('/tidewave/*', expect.any(Function));

      // MCP route
      expect(middlewareUse).toHaveBeenCalledWith('/tidewave/mcp', expect.any(Function));

      // Shell route
      expect(middlewareUse).toHaveBeenCalledWith('/tidewave/shell', expect.any(Function));
    });

    it('should pass config to configureServer', () => {
      const config: TidewaveConfig = {
        allowRemoteAccess: false,
        allowedOrigins: ['https://custom.com'],
      };

      const mockServer = createMockServer();
      const plugin = tidewave(config);

      (plugin.configureServer as any)(mockServer);

      // Middleware should be registered (config is passed internally)
      const middlewareUse = (mockServer as any)._middlewareUse;
      expect(middlewareUse).toHaveBeenCalledTimes(4);
    });
  });

  describe('Route Registration', () => {
    it('should register MCP route with correct path', () => {
      const mockServer = createMockServer();
      const plugin = tidewave();

      (plugin.configureServer as any)(mockServer);

      const middlewareUse = (mockServer as any)._middlewareUse;

      expect(middlewareUse).toHaveBeenCalledWith('/tidewave/mcp', expect.any(Function));
    });

    it('should register shell route with correct path', () => {
      const mockServer = createMockServer();
      const plugin = tidewave();

      (plugin.configureServer as any)(mockServer);

      const middlewareUse = (mockServer as any)._middlewareUse;

      expect(middlewareUse).toHaveBeenCalledWith('/tidewave/shell', expect.any(Function));
    });
  });

  describe('Configuration Validation', () => {
    it('should accept valid allowRemoteAccess values', () => {
      expect(() => tidewave({ allowRemoteAccess: true })).not.toThrow();
      expect(() => tidewave({ allowRemoteAccess: false })).not.toThrow();
    });

    it('should accept valid allowedOrigins arrays', () => {
      const origins = [
        'https://example.com',
        'http://localhost:3000',
        '//sub.domain.com',
        'https://*.example.com',
      ];

      expect(() => tidewave({ allowedOrigins: origins })).not.toThrow();
      expect(() => tidewave({ allowedOrigins: [] })).not.toThrow();
    });

    it('should accept combined configuration options', () => {
      const config: TidewaveConfig = {
        allowRemoteAccess: true,
        allowedOrigins: ['https://trusted.com', 'http://localhost:8080'],
      };

      expect(() => tidewave(config)).not.toThrow();
    });
  });

  describe('Plugin Interface Compliance', () => {
    it('should return valid Vite plugin object', () => {
      const plugin = tidewave();

      expect(plugin).toMatchObject({
        name: expect.any(String),
        configureServer: expect.any(Function),
      });
    });

    it('should have consistent plugin name', () => {
      const plugin1 = tidewave();
      const plugin2 = tidewave({ allowRemoteAccess: true });

      expect(plugin1.name).toBe(plugin2.name);
      expect(plugin1.name).toBe('vite-plugin-tidewave');
    });
  });

  describe('Default Export', () => {
    it('should be a default export function', () => {
      expect(typeof tidewave).toBe('function');
    });

    it('should work with destructured import pattern', () => {
      // This test ensures the export works correctly
      const plugin = tidewave();
      expect(plugin.name).toBe('vite-plugin-tidewave');
    });
  });

  describe('Middleware Registration', () => {
    it('should register middleware in correct order', () => {
      const mockServer = createMockServer();
      const plugin = tidewave();

      (plugin.configureServer as any)(mockServer);

      const middlewareUse = (mockServer as any)._middlewareUse;
      const calls = middlewareUse.mock.calls;

      // First call should be security middleware
      expect(calls[0][0]).toBe('/tidewave/*');
      expect(typeof calls[0][1]).toBe('function');

      // Second call should be decode body middleware
      expect(calls[1][0]).toBe('/tidewave/*');
      expect(typeof calls[1][1]).toBe('function');

      // Third call should be MCP endpoint
      expect(calls[2][0]).toBe('/tidewave/mcp');
      expect(typeof calls[2][1]).toBe('function');

      // Fourth call should be shell endpoint
      expect(calls[3][0]).toBe('/tidewave/shell');
      expect(typeof calls[3][1]).toBe('function');
    });
  });
});
