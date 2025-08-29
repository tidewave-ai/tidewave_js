import { describe, it, expect } from 'vitest';
import { TidewaveExtractor } from '../src/index';
import { isExtractError, isResolveError } from '../src/core';
import path from 'node:path';

describe('Integration Tests', () => {
  const fixturesPath = path.join(__dirname, 'fixtures');

  describe('JavaScript Files', () => {
    it('should extract function from CommonJS export', async () => {
      const result = await TidewaveExtractor.extractDocs('./test/fixtures/sample.js:greetUser');

      expect(isExtractError(result)).toBe(false);
      if (!isExtractError(result)) {
        expect(result.name).toBe('greetUser');
        expect(result.kind).toBe('function');
        expect(result.documentation).toContain('A sample function for testing');
        expect(result.jsDoc).toContain('@param name');
        expect(result.jsDoc).toContain('@returns A greeting message');
        expect(result.location).toContain('sample.js');
      }
    });

    it('should extract class from CommonJS export', async () => {
      const result = await TidewaveExtractor.extractDocs('./test/fixtures/sample.js:TestClass');

      expect(isExtractError(result)).toBe(false);
      if (!isExtractError(result)) {
        expect(result.name).toBe('TestClass');
        expect(result.kind).toBe('class');
        expect(result.documentation).toContain('A sample class for testing');
        expect(result.location).toContain('sample.js');
      }
    });

    it('should extract instance method from JavaScript class', async () => {
      const result = await TidewaveExtractor.extractDocs(
        './test/fixtures/sample.js:TestClass#getValue',
      );

      expect(isExtractError(result)).toBe(false);
      if (!isExtractError(result)) {
        expect(result.name).toBe('TestClass#getValue');
        expect(result.kind).toBe('method');
        expect(result.documentation).toContain('Get the value');
        expect(result.jsDoc).toContain('@returns The current value');
      }
    });

    it('should extract static method from JavaScript class', async () => {
      const result = await TidewaveExtractor.extractDocs(
        './test/fixtures/sample.js:TestClass.create',
      );

      expect(isExtractError(result)).toBe(false);
      if (!isExtractError(result)) {
        expect(result.name).toBe('TestClass.create');
        expect(result.kind).toBe('method');
        expect(result.documentation).toContain('Static factory method');
        expect(result.jsDoc).toContain('@returns New instance');
      }
    });
  });

  describe('TypeScript Files', () => {
    it('should extract interface from TypeScript export', async () => {
      const result = await TidewaveExtractor.extractDocs('./test/fixtures/sample.ts:User');

      expect(isExtractError(result)).toBe(false);
      if (!isExtractError(result)) {
        expect(result.name).toBe('User');
        expect(result.kind).toBe('interface');
        expect(result.documentation).toContain('A sample TypeScript interface');
        expect(result.location).toContain('sample.ts');
      }
    });

    it('should extract class from TypeScript export', async () => {
      const result = await TidewaveExtractor.extractDocs('./test/fixtures/sample.ts:UserManager');

      expect(isExtractError(result)).toBe(false);
      if (!isExtractError(result)) {
        expect(result.name).toBe('UserManager');
        expect(result.kind).toBe('class');
        expect(result.documentation).toContain('A sample TypeScript class');
      }
    });

    it('should extract instance method from TypeScript class', async () => {
      const result = await TidewaveExtractor.extractDocs(
        './test/fixtures/sample.ts:UserManager#addUser',
      );

      expect(isExtractError(result)).toBe(false);
      if (!isExtractError(result)) {
        expect(result.name).toBe('UserManager#addUser');
        expect(result.kind).toBe('method');
        expect(result.documentation).toContain('Add a user');
      }
    });

    it('should extract static method from TypeScript class', async () => {
      const result = await TidewaveExtractor.extractDocs(
        './test/fixtures/sample.ts:UserManager.create',
      );

      expect(isExtractError(result)).toBe(false);
      if (!isExtractError(result)) {
        expect(result.name).toBe('UserManager.create');
        expect(result.kind).toBe('method');
        expect(result.documentation).toContain('Static factory method');
      }
    });

    it('should extract generic function', async () => {
      const result = await TidewaveExtractor.extractDocs('./test/fixtures/sample.ts:processItems');

      expect(isExtractError(result)).toBe(false);
      if (!isExtractError(result)) {
        expect(result.name).toBe('processItems');
        expect(result.kind).toBe('function');
        expect(result.documentation).toContain('Sample utility function');
        expect(result.signature).toContain('processItems');
      }
    });
  });

  describe('Source Path Resolution', () => {
    it('should resolve JavaScript file path', async () => {
      const sourcePath = await TidewaveExtractor.getSourcePath('./test/fixtures/sample.js');

      expect(isResolveError(sourcePath)).toBe(false);
      if (!isResolveError(sourcePath)) {
        expect(sourcePath.path).toContain('test/fixtures/sample.js');
      }
    });

    it('should resolve TypeScript file path', async () => {
      const sourcePath = await TidewaveExtractor.getSourcePath('./test/fixtures/sample.ts');

      expect(isResolveError(sourcePath)).toBe(false);
      if (!isResolveError(sourcePath)) {
        expect(sourcePath.path).toContain('test/fixtures/sample.ts');
      }
    });

    it('should resolve node_modules dependency', async () => {
      const sourcePath = await TidewaveExtractor.getSourcePath('typescript');

      expect(isResolveError(sourcePath)).toBe(false);
      if (!isResolveError(sourcePath)) {
        expect(sourcePath.path).toMatch(/typescript.*\.d\.ts$/);
      }
    });
  });

  describe('Builtin Modules', () => {
    it('should extract Math global', async () => {
      const result = await TidewaveExtractor.extractDocs('node:Math');

      expect(isExtractError(result)).toBe(false);
      if (!isExtractError(result)) {
        expect(result.name).toBe('Math');
        expect(result.kind).toBe('interface');
        expect(result.documentation).toContain('mathematics functionality');
      }
    });

    it('should extract Math.max static method', async () => {
      const result = await TidewaveExtractor.extractDocs('node:Math.max');

      expect(isExtractError(result)).toBe(false);
      if (!isExtractError(result)) {
        expect(result.name).toBe('Math.max');
        expect(result.kind).toBe('method');
        expect(result.documentation).toContain('Returns the larger of a set');
        expect(result.signature).toContain('(...values: number[]): number');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid module path format', async () => {
      const result = await TidewaveExtractor.extractDocs('invalid-format');

      expect(isExtractError(result)).toBe(true);
    });

    it('should handle non-existent module', async () => {
      const result = await TidewaveExtractor.extractDocs('non-existent-module:symbol');

      expect(isExtractError(result)).toBe(true);
    });

    it('should handle non-existent symbol', async () => {
      const result = await TidewaveExtractor.extractDocs(
        './test/fixtures/sample.ts:NonExistentSymbol',
      );

      expect(isExtractError(result)).toBe(true);
    });

    it('should handle non-existent member', async () => {
      const result = await TidewaveExtractor.extractDocs(
        './test/fixtures/sample.ts:UserManager#nonExistentMethod',
      );

      expect(isExtractError(result)).toBe(true);
    });
  });

  describe('Output Formatting', () => {
    it('should format symbol info correctly', async () => {
      const result = await TidewaveExtractor.extractDocs('./test/fixtures/sample.ts:User');

      expect(isExtractError(result)).toBe(false);
      if (!isExtractError(result)) {
        const formatted = TidewaveExtractor.formatOutput(result);

        expect(formatted).toContain('User');
        expect(formatted).toContain('Kind: interface');
        expect(formatted).toContain('Location:');
        expect(formatted).toContain('Type:');
        expect(formatted).toContain('Documentation:');
      }
    });

    it('should format function with signature', async () => {
      const result = await TidewaveExtractor.extractDocs('./test/fixtures/sample.ts:processItems');

      expect(isExtractError(result)).toBe(false);
      if (!isExtractError(result)) {
        const formatted = TidewaveExtractor.formatOutput(result);

        expect(formatted).toContain('processItems');
        expect(formatted).toContain('Signature:');
        expect(formatted).toContain('processItems');
      }
    });
  });
});
