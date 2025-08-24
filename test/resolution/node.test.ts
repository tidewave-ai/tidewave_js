import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveModule, canResolveNode } from '../../src/resolution/node';
import type { ModuleRequest } from '../../src/core/types';

// Mock fs.access and fs.readFile
vi.mock('node:fs/promises', () => ({
  default: {
    access: vi.fn(),
    readFile: vi.fn(),
  },
}));

const mockFs = vi.mocked(fs);

describe('Node Resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('canResolveNode', () => {
    it('should handle node runtime', () => {
      const request: ModuleRequest = {
        specifier: 'lodash',
        source: './src/index.ts',
        runtime: 'node',
      };

      expect(canResolveNode(request)).toBe(true);
    });

    it('should handle undefined runtime (default to node)', () => {
      const request: ModuleRequest = {
        specifier: 'lodash',
        source: './src/index.ts',
      };

      expect(canResolveNode(request)).toBe(true);
    });

    it('should reject other runtimes', () => {
      const request: ModuleRequest = {
        specifier: 'lodash',
        source: './src/index.ts',
        runtime: 'bun',
      };

      expect(canResolveNode(request)).toBe(false);
    });
  });

  describe('resolveModule', () => {
    describe('relative imports', () => {
      it('should resolve relative .ts file', async () => {
        const request: ModuleRequest = {
          specifier: './utils',
          source: '/project/src/index.ts',
        };

        mockFs.access.mockResolvedValueOnce(undefined); // file exists

        const result = await resolveModule(request);

        expect(result).toMatchObject({
          path: path.resolve('/project/src/utils'),
          format: 'commonjs', // No extension, so defaults to commonjs
        });
        expect(mockFs.access).toHaveBeenCalledWith(path.resolve('/project/src/utils'));
      });

      it('should try extensions when base file not found', async () => {
        const request: ModuleRequest = {
          specifier: './helper',
          source: '/project/src/index.ts',
        };

        mockFs.access
          .mockRejectedValueOnce(new Error('not found')) // base file
          .mockResolvedValueOnce(undefined); // .ts extension

        const result = await resolveModule(request);

        expect(result).toMatchObject({
          path: path.resolve('/project/src/helper.ts'),
          format: 'typescript',
        });
      });

      it('should try index files', async () => {
        const request: ModuleRequest = {
          specifier: './components',
          source: '/project/src/index.ts',
        };

        mockFs.access
          .mockRejectedValueOnce(new Error('not found')) // base file
          .mockRejectedValueOnce(new Error('not found')) // .ts
          .mockRejectedValueOnce(new Error('not found')) // .tsx
          .mockRejectedValueOnce(new Error('not found')) // .js
          .mockRejectedValueOnce(new Error('not found')) // .jsx
          .mockRejectedValueOnce(new Error('not found')) // .mjs
          .mockRejectedValueOnce(new Error('not found')) // .cjs
          .mockRejectedValueOnce(new Error('not found')) // .json
          .mockResolvedValueOnce(undefined); // index.ts

        const result = await resolveModule(request);

        expect(result).toMatchObject({
          path: path.resolve('/project/src/components/index.ts'),
          format: 'typescript',
        });
      });

      it('should return error when file not found', async () => {
        const request: ModuleRequest = {
          specifier: './nonexistent',
          source: '/project/src/index.ts',
        };

        mockFs.access.mockRejectedValue(new Error('not found'));

        const result = await resolveModule(request);

        expect(result).toMatchObject({
          success: false,
          error: {
            code: 'MODULE_NOT_FOUND',
            message: expect.stringContaining('nonexistent'),
          },
        });
      });
    });

    describe('node_modules dependencies', () => {
      it('should resolve dependency from node_modules', async () => {
        const request: ModuleRequest = {
          specifier: 'lodash',
          source: '/project/src/index.ts',
        };

        const packageJsonContent = JSON.stringify({
          name: 'lodash',
          main: 'index.js',
        });

        mockFs.access
          .mockResolvedValueOnce(undefined) // package.json exists
          .mockResolvedValueOnce(undefined); // main file exists

        mockFs.readFile.mockResolvedValueOnce(packageJsonContent);

        const result = await resolveModule(request);

        expect(result).toMatchObject({
          path: path.resolve('/project/src/node_modules/lodash/index.js'),
          format: 'commonjs',
        });
      });

      it('should handle missing package.json', async () => {
        const request: ModuleRequest = {
          specifier: 'nonexistent-package',
          source: '/project/src/index.ts',
        };

        mockFs.access.mockRejectedValue(new Error('not found'));

        const result = await resolveModule(request);

        expect(result).toMatchObject({
          success: false,
          error: {
            code: 'MODULE_NOT_FOUND',
          },
        });
      });

      it('should handle malformed package.json', async () => {
        const request: ModuleRequest = {
          specifier: 'broken-package',
          source: '/project/src/index.ts',
        };

        mockFs.access.mockResolvedValueOnce(undefined); // package.json exists
        mockFs.readFile.mockResolvedValueOnce('invalid json');

        const result = await resolveModule(request);

        expect(result).toMatchObject({
          success: false,
          error: {
            code: 'MODULE_NOT_FOUND',
          },
        });
      });

      it('should use default main when not specified', async () => {
        const request: ModuleRequest = {
          specifier: 'simple-package',
          source: '/project/src/index.ts',
        };

        const packageJsonContent = JSON.stringify({
          name: 'simple-package',
          // no main field
        });

        mockFs.access
          .mockResolvedValueOnce(undefined) // package.json exists
          .mockResolvedValueOnce(undefined); // default index.js exists

        mockFs.readFile.mockResolvedValueOnce(packageJsonContent);

        const result = await resolveModule(request);

        expect(result).toMatchObject({
          path: path.resolve('/project/src/node_modules/simple-package/index.js'),
          format: 'commonjs',
        });
      });
    });

    describe('format detection', () => {
      it('should detect TypeScript format', async () => {
        const request: ModuleRequest = {
          specifier: './utils.ts',
          source: '/project/src/index.ts',
        };

        mockFs.access.mockResolvedValueOnce(undefined);

        const result = await resolveModule(request);

        expect(result).toMatchObject({
          format: 'typescript',
        });
      });

      it('should detect module format for .mjs', async () => {
        const request: ModuleRequest = {
          specifier: './utils.mjs',
          source: '/project/src/index.ts',
        };

        mockFs.access.mockResolvedValueOnce(undefined);

        const result = await resolveModule(request);

        expect(result).toMatchObject({
          format: 'module',
        });
      });

      it('should default to commonjs format', async () => {
        const request: ModuleRequest = {
          specifier: './utils.js',
          source: '/project/src/index.ts',
        };

        mockFs.access.mockResolvedValueOnce(undefined);

        const result = await resolveModule(request);

        expect(result).toMatchObject({
          format: 'commonjs',
        });
      });
    });

    describe('caching', () => {
      it('should cache resolved modules', async () => {
        const request: ModuleRequest = {
          specifier: './cached-module',
          source: '/project/src/index.ts',
        };

        mockFs.access.mockResolvedValue(undefined);

        // First call
        const result1 = await resolveModule(request);

        // Second call (should use cache)
        const result2 = await resolveModule(request);

        expect(result1).toEqual(result2);
        expect(mockFs.access).toHaveBeenCalledTimes(1); // Only called once due to caching
      });
    });

    describe('error handling', () => {
      it('should handle unexpected errors', async () => {
        const request: ModuleRequest = {
          specifier: './error-module',
          source: '/project/src/index.ts',
        };

        // Mock all extension attempts to fail, then catch block will be triggered by try-catch
        mockFs.access.mockRejectedValue(new Error('not found'));

        const result = await resolveModule(request);

        expect(result).toMatchObject({
          success: false,
          error: {
            code: 'MODULE_NOT_FOUND',
            message: expect.stringContaining('error-module'),
          },
        });
      });
    });
  });
});
