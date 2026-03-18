import { describe, it, expect, vi, beforeEach } from 'vitest';
import tidewave from '../src/rsbuild-plugin';
import type { TidewaveConfig } from '../src/core';

// Mock the Rsbuild plugin API
const createMockApi = () => {
  const callbacks: ((config: any) => void)[] = [];

  return {
    modifyRsbuildConfig: (cb: (config: any) => void) => {
      callbacks.push(cb);
    },
    _runCallbacks: (config: any) => {
      for (const cb of callbacks) {
        cb(config);
      }
    },
  };
};

describe('Tidewave Rsbuild Plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Plugin Creation', () => {
    it('should create plugin with default config', () => {
      const plugin = tidewave();

      expect(plugin.name).toBe('rsbuild-plugin-tidewave');
      expect(plugin.apply).toBe('serve');
      expect(typeof plugin.setup).toBe('function');
    });

    it('should create plugin with custom config', () => {
      const config: TidewaveConfig = {
        allowRemoteAccess: true,
      };

      const plugin = tidewave(config);

      expect(plugin.name).toBe('rsbuild-plugin-tidewave');
      expect(plugin.apply).toBe('serve');
    });

    it('should handle empty config object', () => {
      const plugin = tidewave({});

      expect(plugin.name).toBe('rsbuild-plugin-tidewave');
    });

    it('should handle undefined config', () => {
      const plugin = tidewave(undefined as any);

      expect(plugin.name).toBe('rsbuild-plugin-tidewave');
    });
  });

  describe('Plugin Interface Compliance', () => {
    it('should return valid Rsbuild plugin object', () => {
      const plugin = tidewave();

      expect(plugin).toMatchObject({
        name: expect.any(String),
        apply: 'serve',
        setup: expect.any(Function),
      });
    });

    it('should only apply during dev server', () => {
      const plugin = tidewave();

      expect(plugin.apply).toBe('serve');
    });

    it('should have consistent plugin name', () => {
      const plugin1 = tidewave();
      const plugin2 = tidewave({ allowRemoteAccess: true });

      expect(plugin1.name).toBe(plugin2.name);
      expect(plugin1.name).toBe('rsbuild-plugin-tidewave');
    });
  });

  describe('Setup and Middleware Registration', () => {
    it('should register modifyRsbuildConfig callback', () => {
      const plugin = tidewave();
      const api = createMockApi();

      plugin.setup(api);

      const config: any = { dev: {} };
      api._runCallbacks(config);

      expect(config.dev.setupMiddlewares).toBeDefined();
    });

    it('should preserve existing setupMiddlewares (array)', () => {
      const plugin = tidewave();
      const api = createMockApi();
      const existingMiddleware = vi.fn();

      plugin.setup(api);

      const config: any = { dev: { setupMiddlewares: [existingMiddleware] } };
      api._runCallbacks(config);

      expect(config.dev.setupMiddlewares).toHaveLength(2);
      expect(config.dev.setupMiddlewares[0]).toBe(existingMiddleware);
    });

    it('should preserve existing setupMiddlewares (function)', () => {
      const plugin = tidewave();
      const api = createMockApi();
      const existingMiddleware = vi.fn();

      plugin.setup(api);

      const config: any = { dev: { setupMiddlewares: existingMiddleware } };
      api._runCallbacks(config);

      expect(config.dev.setupMiddlewares).toHaveLength(2);
      expect(config.dev.setupMiddlewares[0]).toBe(existingMiddleware);
    });

    it('should initialise dev config if missing', () => {
      const plugin = tidewave();
      const api = createMockApi();

      plugin.setup(api);

      const config: any = {};
      api._runCallbacks(config);

      expect(config.dev).toBeDefined();
      expect(config.dev.setupMiddlewares).toBeDefined();
    });

    it('should add Connect app to middleware via unshift', () => {
      const plugin = tidewave();
      const api = createMockApi();

      plugin.setup(api);

      const config: any = { dev: {} };
      api._runCallbacks(config);

      const unshift = vi.fn();
      const middlewares = { unshift };

      // Run the setupMiddlewares callback
      const tidewaveSetup = config.dev.setupMiddlewares[config.dev.setupMiddlewares.length - 1];
      tidewaveSetup(middlewares);

      // Should unshift a Connect app (which is a function)
      expect(unshift).toHaveBeenCalledTimes(1);
      expect(typeof unshift.mock.calls[0]?.[0]).toBe('function');
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
        projectName: 'my-app',
      };

      expect(() => tidewave(config)).not.toThrow();
    });
  });

  describe('Default Export', () => {
    it('should be a default export function', () => {
      expect(typeof tidewave).toBe('function');
    });
  });
});
