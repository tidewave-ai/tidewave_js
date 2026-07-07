import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ViteDevServer } from 'vite';
import tidewave from '../src/vite-plugin';
import type { TidewaveConfig } from '../src/core';

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
    httpServer: {
      address: vi.fn(() => ({ address: '127.0.0.1', family: 'IPv4', port: 4321 })),
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
    it('should register middleware on server configuration', async () => {
      const mockServer = createMockServer();
      const plugin = tidewave();

      await (plugin.configureServer as any)(mockServer);

      const middlewareUse = (mockServer as any)._middlewareUse;

      // Should register 6 middleware: security + html + config + upload + MCP body parser + MCP routes
      expect(middlewareUse).toHaveBeenCalledTimes(6);

      // Global security middleware
      expect(middlewareUse).toHaveBeenCalledWith('/tidewave', expect.any(Function));

      // HTML route
      expect(middlewareUse).toHaveBeenCalledWith('/tidewave/', expect.any(Function));

      // Config route
      expect(middlewareUse).toHaveBeenCalledWith('/tidewave/config', expect.any(Function));

      // Upload route
      expect(middlewareUse).toHaveBeenCalledWith('/tidewave/upload', expect.any(Function));

      // MCP route
      expect(middlewareUse).toHaveBeenCalledWith('/tidewave/mcp', expect.any(Function));
    });

    it('should pass config to configureServer', async () => {
      const config: TidewaveConfig = {
        allowRemoteAccess: false,
      };

      const mockServer = createMockServer();
      const plugin = tidewave(config);

      await (plugin.configureServer as any)(mockServer);

      // Middleware should be registered (config is passed internally)
      const middlewareUse = (mockServer as any)._middlewareUse;
      expect(middlewareUse).toHaveBeenCalledTimes(6);
    });

    it('should use the actual Vite server port in config responses', async () => {
      const mockServer = createMockServer('localhost', 5173);
      const plugin = tidewave();

      await (plugin.configureServer as any)(mockServer);

      const configHandler = (mockServer as any)._middlewareUse.mock.calls[2][1];
      const req = {
        socket: { remoteAddress: '127.0.0.1' },
        headers: {
          host: 'localhost:5173',
          origin: 'http://localhost:9999',
        },
      };
      const res = {
        statusCode: 200,
        setHeader: vi.fn(),
        end: vi.fn(),
        headersSent: false,
      };

      await configHandler(req, res, vi.fn());

      expect(res.statusCode).toBe(200);
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
      expect(JSON.parse(res.end.mock.calls[0]![0])).toMatchObject({
        framework_type: 'vite',
        local_port: 4321,
      });
    });
  });

  describe('Route Registration', () => {
    it('should register MCP route with correct path', async () => {
      const mockServer = createMockServer();
      const plugin = tidewave();

      await (plugin.configureServer as any)(mockServer);

      const middlewareUse = (mockServer as any)._middlewareUse;

      expect(middlewareUse).toHaveBeenCalledWith('/tidewave/mcp', expect.any(Function));
    });
  });

  describe('Configuration Validation', () => {
    it('should accept valid allowRemoteAccess values', () => {
      expect(() => tidewave({ allowRemoteAccess: true })).not.toThrow();
      expect(() => tidewave({ allowRemoteAccess: false })).not.toThrow();
    });

    it('should accept combined configuration options', () => {
      const config: TidewaveConfig = {
        allowRemoteAccess: true,
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
    it('should register middleware in correct order', async () => {
      const mockServer = createMockServer();
      const plugin = tidewave();

      await (plugin.configureServer as any)(mockServer);

      const middlewareUse = (mockServer as any)._middlewareUse;
      const calls = middlewareUse.mock.calls;

      // First call should be security middleware
      expect(calls[0][0]).toBe('/tidewave');
      expect(typeof calls[0][1]).toBe('function');

      // Second call should be HTML endpoint (empty string = '/')
      expect(calls[1][0]).toBe('/tidewave/');
      expect(typeof calls[1][1]).toBe('function');

      // Third call should be config endpoint
      expect(calls[2][0]).toBe('/tidewave/config');
      expect(typeof calls[2][1]).toBe('function');

      // Fourth call should be upload endpoint
      expect(calls[3][0]).toBe('/tidewave/upload');
      expect(typeof calls[3][1]).toBe('function');

      // Fifth call should parse JSON only for the MCP endpoint
      expect(calls[4][0]).toBe('/tidewave/mcp');
      expect(typeof calls[4][1]).toBe('function');

      // Sixth call should be MCP endpoint
      expect(calls[5][0]).toBe('/tidewave/mcp');
      expect(typeof calls[5][1]).toBe('function');
    });
  });
});
