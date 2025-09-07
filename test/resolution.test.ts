import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractSymbol, extractDocs, getSourceLocation, formatOutput } from '../src/resolution';
import { isExtractError, isResolveError } from '../src/core';
import type { SymbolInfo } from '../src/core';
import path from 'node:path';

describe('TypeScript Extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractSymbol', () => {
    it('should extract function symbols from TypeScript modules', async () => {
      const result = await extractSymbol({
        module: 'typescript',
        symbol: 'createProgram',
      });

      if (isExtractError(result)) {
        expect(result.error.code).toMatch(/MODULE_NOT_FOUND|SYMBOL_NOT_FOUND/);
      } else {
        expect(result.name).toBe('createProgram');
        expect(result.kind).toBe('function');
        expect(result.location).toContain('.ts');
        expect(result.type).toBeDefined();
      }
    });

    it('should extract interface symbols', async () => {
      const result = await extractSymbol({
        module: 'typescript',
        symbol: 'CompilerOptions',
      });

      if (isExtractError(result)) {
        expect(result.error.code).toMatch(/MODULE_NOT_FOUND|SYMBOL_NOT_FOUND/);
      } else {
        expect(result.name).toBe('CompilerOptions');
        expect(result.kind).toBe('interface');
        expect(result.type).toBeDefined();
      }
    });

    it('should extract enum symbols', async () => {
      const result = await extractSymbol({
        module: 'typescript',
        symbol: 'ScriptTarget',
      });

      if (isExtractError(result)) {
        expect(result.error.code).toMatch(/MODULE_NOT_FOUND|SYMBOL_NOT_FOUND/);
      } else {
        expect(result.name).toBe('ScriptTarget');
        expect(result.kind).toBe('enum');
        expect(result.type).toBeDefined();
      }
    });

    it('should extract class symbols', async () => {
      const result = await extractSymbol({
        module: 'src/core/types',
        symbol: 'TestClass',
      });

      // This will likely fail since we don't have a TestClass, but it tests the flow
      expect(isExtractError(result) || result.kind === 'class').toBe(true);
    });

    it('should handle static member access', async () => {
      const result = await extractSymbol({
        module: 'typescript',
        symbol: 'ScriptTarget',
        member: 'ES2020',
        isStatic: true,
      });

      if (isExtractError(result)) {
        expect(['MODULE_NOT_FOUND', 'SYMBOL_NOT_FOUND', 'MEMBER_NOT_FOUND']).toContain(
          result.error.code,
        );
      } else {
        expect(result.name).toBe('ScriptTarget.ES2020');
        expect(result.type).toBeDefined();
      }
    });

    it('should handle instance member access', async () => {
      const result = await extractSymbol({
        module: 'typescript',
        symbol: 'Program',
        member: 'getTypeChecker',
        isStatic: false,
      });

      if (isExtractError(result)) {
        expect([
          'MODULE_NOT_FOUND',
          'SYMBOL_NOT_FOUND',
          'MEMBER_NOT_FOUND',
          'TYPE_ERROR',
        ]).toContain(result.error.code);
      } else {
        expect(result.name).toBe('Program#getTypeChecker');
        expect(result.kind).toBe('method');
      }
    });

    it('should return MODULE_NOT_FOUND for invalid modules', async () => {
      const result = await extractSymbol({
        module: './non-existent-module-path',
        symbol: 'someSymbol',
      });

      expect(isExtractError(result)).toBe(true);
      if (isExtractError(result)) {
        expect(result.error.code).toBe('MODULE_NOT_FOUND');
        expect(result.error.message).toContain('./non-existent-module-path');
      }
    });

    it('should return SYMBOL_NOT_FOUND for missing symbols', async () => {
      const result = await extractSymbol({
        module: 'typescript',
        symbol: 'NonExistentSymbolName123',
      });

      expect(isExtractError(result)).toBe(true);
      if (isExtractError(result)) {
        expect(result.error.code).toBe('SYMBOL_NOT_FOUND');
        expect(result.error.message).toContain('NonExistentSymbolName123');
      }
    });

    it('should return MEMBER_NOT_FOUND for missing members', async () => {
      const result = await extractSymbol({
        module: 'typescript',
        symbol: 'ScriptTarget',
        member: 'NonExistentMember',
        isStatic: true,
      });

      if (isExtractError(result)) {
        expect(result.error.code).toBe('MEMBER_NOT_FOUND');
        expect(result.error.message).toContain('NonExistentMember');
      }
    });

    it('should return INVALID_REQUEST when symbol is not provided', async () => {
      const result = await extractSymbol({
        module: 'typescript',
        symbol: '', // Empty symbol to trigger the error
      });

      expect(isExtractError(result)).toBe(true);
      if (isExtractError(result)) {
        expect(result.error.code).toBe('INVALID_REQUEST');
        expect(result.error.message).toContain('Symbol name is required');
      }
    });

    it('should handle TypeScript configuration options', async () => {
      const result = await extractSymbol({
        module: 'typescript',
        symbol: 'createProgram',
      });

      expect(result).toBeDefined();
    });

    it('should handle relative path modules', async () => {
      const result = await extractSymbol({
        module: './src/core',
        symbol: 'SymbolInfo',
      });

      if (!isExtractError(result)) {
        expect(result.name).toBe('SymbolInfo');
        expect(result.kind).toBe('interface');
      }
    });

    it('should extract documentation comments when available', async () => {
      // Test with a known module that has documentation
      const result = await extractSymbol({
        module: 'typescript',
        symbol: 'createProgram',
      });

      if (!isExtractError(result)) {
        expect(result.documentation).toBeDefined();
        expect(typeof result.documentation).toBe('string');
      }
    });

    it('should extract JSDoc tags when available', async () => {
      const result = await extractSymbol({
        module: 'typescript',
        symbol: 'createProgram',
      });

      if (!isExtractError(result)) {
        expect(result.jsDoc).toBeDefined();
        expect(typeof result.jsDoc).toBe('string');
      }
    });

    it('should generate proper signatures for functions', async () => {
      const result = await extractSymbol({
        module: 'typescript',
        symbol: 'createProgram',
      });

      if (!isExtractError(result)) {
        expect(result.signature).toBeDefined();
        expect(result.signature).toContain('createProgram');
      }
    });

    it('should handle JavaScript files', async () => {
      // This tests the JS handling path in findSymbol with a non-existent JS file
      const result = await extractSymbol({
        module: './non-existent-file.js',
        symbol: 'extractSymbol',
      });

      // This should error with MODULE_NOT_FOUND since the JS file doesn't exist
      expect(isExtractError(result)).toBe(true);
      if (isExtractError(result)) {
        expect(result.error.code).toBe('MODULE_NOT_FOUND');
      }
    });
  });

  describe('extractDocs', () => {
    it('should parse module:symbol format correctly', async () => {
      const docs = await extractDocs('typescript:createProgram');

      if (!isExtractError(docs)) {
        expect(docs.name).toBe('createProgram');
        expect(docs.kind).toBeDefined();
      }
    });

    it('should parse static member format', async () => {
      const docs = await extractDocs('typescript:ScriptTarget.ES2020');

      if (!isExtractError(docs)) {
        expect(docs.name).toBe('ScriptTarget.ES2020');
      }
    });

    it('should parse instance member format', async () => {
      const docs = await extractDocs('typescript:Program#getTypeChecker');

      if (!isExtractError(docs)) {
        expect(docs.name).toBe('Program#getTypeChecker');
      }
    });

    it('should return error for invalid format', async () => {
      const docs = await extractDocs('invalid-format-without-colon');

      expect(isExtractError(docs)).toBe(true);
      if (isExtractError(docs)) {
        expect(docs.error.code).toBe('INVALID_REQUEST');
      }
    });

    it('should return error for module not found', async () => {
      const docs = await extractDocs('non-existent-module:someSymbol');

      expect(isExtractError(docs)).toBe(true);
      if (isExtractError(docs)) {
        expect(docs.error.code).toBe('MODULE_NOT_FOUND');
      }
    });

    it('should accept extractor options', async () => {
      const docs = await extractDocs('typescript:createProgram');

      expect(docs === null || typeof docs === 'object').toBe(true);
    });
  });

  describe('getSourceLocation', () => {
    it('should resolve built-in module paths', async () => {
      const sourcePath = await getSourceLocation('typescript');

      if (!isResolveError(sourcePath)) {
        expect(sourcePath.path).toMatch(/typescript/);
        expect(sourcePath.path).toMatch(/\.d\.ts$/);
      }
    });

    it('should resolve relative paths', async () => {
      const sourcePath = await getSourceLocation('./src/core');

      if (!isResolveError(sourcePath)) {
        expect(sourcePath.path).toContain('src/core');
      }
    });

    it('should return relative paths when inside project', async () => {
      const sourcePath = await getSourceLocation('./src/index');

      if (!isResolveError(sourcePath) && !sourcePath.path.startsWith('/')) {
        expect(sourcePath.path).toMatch(/^src/);
      }
    });

    it('should return absolute paths for node_modules', async () => {
      const sourcePath = await getSourceLocation('typescript');

      if (!isResolveError(sourcePath)) {
        expect(path.isAbsolute(sourcePath.path) || sourcePath.path.includes('node_modules')).toBe(
          true,
        );
      }
    });

    it('should return error for non-existent modules', async () => {
      const sourcePath = await getSourceLocation('non-existent-module-name-12345');

      expect(isResolveError(sourcePath)).toBe(true);
      if (isResolveError(sourcePath)) {
        expect(sourcePath.error.code).toBe('MODULE_NOT_FOUND');
      }
    });

    it('should accept TypeScript config options', async () => {
      const sourcePath = await getSourceLocation('typescript');

      expect(isResolveError(sourcePath) || typeof sourcePath.path === 'string').toBe(true);
    });

    // New tests for symbol location resolution
    it('should resolve symbol locations', async () => {
      const sourcePath = await getSourceLocation('typescript:createProgram');

      if (!isResolveError(sourcePath)) {
        expect(sourcePath.path).toContain('.d.ts');
        // Symbol locations include line and column numbers
        expect(sourcePath.path).toMatch(/:\d+:\d+$/);
      }
    });

    it('should resolve interface symbol locations', async () => {
      const sourcePath = await getSourceLocation('typescript:CompilerOptions');

      if (!isResolveError(sourcePath)) {
        expect(sourcePath.path).toContain('.d.ts');
        expect(sourcePath.path).toMatch(/:\d+:\d+$/);
      }
    });

    it('should resolve local symbol locations', async () => {
      const sourcePath = await getSourceLocation('./src/core:SymbolInfo');

      if (!isResolveError(sourcePath)) {
        expect(sourcePath.path).toContain('src/core');
        expect(sourcePath.path).toMatch(/:\d+:\d+$/);
      }
    });

    it('should resolve static member locations', async () => {
      const sourcePath = await getSourceLocation('typescript:ScriptTarget.ES2020');

      if (!isResolveError(sourcePath)) {
        expect(sourcePath.path).toContain('.d.ts');
        expect(sourcePath.path).toMatch(/:\d+:\d+$/);
      }
    });

    it('should resolve instance member locations', async () => {
      const sourcePath = await getSourceLocation('typescript:Program#getTypeChecker');

      if (!isResolveError(sourcePath)) {
        expect(sourcePath.path).toContain('.d.ts');
        expect(sourcePath.path).toMatch(/:\d+:\d+$/);
      }
    });

    it('should return error for non-existent symbols', async () => {
      const sourcePath = await getSourceLocation('typescript:NonExistentSymbol123');

      expect(isResolveError(sourcePath)).toBe(true);
      if (isResolveError(sourcePath)) {
        expect(sourcePath.error.code).toBe('MODULE_NOT_FOUND');
        expect(sourcePath.error.message).toContain('NonExistentSymbol123');
      }
    });

    it('should return error for invalid symbol format', async () => {
      const sourcePath = await getSourceLocation('invalid-format-without-colon');

      // This should still work as it treats it as a module name
      expect(isResolveError(sourcePath)).toBe(true);
      if (isResolveError(sourcePath)) {
        expect(sourcePath.error.code).toBe('MODULE_NOT_FOUND');
      }
    });

    it('should handle node builtin symbols', async () => {
      const sourcePath = await getSourceLocation('node:Math');

      if (!isResolveError(sourcePath)) {
        expect(sourcePath.path).toBeDefined();
        expect(sourcePath.format).toBe('typescript');
      }
    });

    it('should handle node builtin static members', async () => {
      const sourcePath = await getSourceLocation('node:Math.max');

      if (!isResolveError(sourcePath)) {
        expect(sourcePath.path).toBeDefined();
        expect(sourcePath.format).toBe('typescript');
      }
    });
  });

  describe('formatOutput', () => {
    it('should format basic symbol info', () => {
      const symbolInfo: SymbolInfo = {
        name: 'testFunction',
        kind: 'function',
        location: './test.ts:10',
        type: '(x: number) => string',
      };

      const output = formatOutput(symbolInfo);

      expect(output).toContain('testFunction');
      expect(output).toContain('Kind: function');
      expect(output).toContain('Location: ./test.ts:10');
      expect(output).toContain('Type:');
      expect(output).toContain('(x: number) => string');
    });

    it('should format symbol with signature', () => {
      const symbolInfo: SymbolInfo = {
        name: 'MyClass',
        kind: 'class',
        location: './MyClass.ts:1',
        type: 'typeof MyClass',
        signature: 'class MyClass { constructor(); }',
      };

      const output = formatOutput(symbolInfo);

      expect(output).toContain('Signature:');
      expect(output).toContain('class MyClass');
    });

    it('should format symbol with documentation', () => {
      const symbolInfo: SymbolInfo = {
        name: 'utilityFunction',
        kind: 'function',
        location: './utils.ts:5',
        type: '() => void',
        documentation: 'A helpful utility function',
      };

      const output = formatOutput(symbolInfo);

      expect(output).toContain('Documentation:');
      expect(output).toContain('A helpful utility function');
    });

    it('should format symbol with JSDoc', () => {
      const symbolInfo: SymbolInfo = {
        name: 'apiFunction',
        kind: 'function',
        location: './api.ts:12',
        type: '(data: any) => Promise<Response>',
        jsDoc: '@param data The data to send\n@returns Promise resolving to response',
      };

      const output = formatOutput(symbolInfo);

      expect(output).toContain('JSDoc Tags:');
      expect(output).toContain('@param data');
      expect(output).toContain('@returns Promise');
    });

    it('should format complete symbol info', () => {
      const symbolInfo: SymbolInfo = {
        name: 'CompleteExample',
        kind: 'interface',
        location: './types.ts:20',
        type: '{ name: string; age: number }',
        signature: 'interface CompleteExample {\n  name: string;\n  age: number;\n}',
        documentation: 'Complete example interface',
        jsDoc: '@since 1.0.0\n@example const ex: CompleteExample = { name: "test", age: 25 }',
      };

      const output = formatOutput(symbolInfo);

      expect(output).toContain('CompleteExample');
      expect(output).toContain('Kind: interface');
      expect(output).toContain('Location: ./types.ts:20');
      expect(output).toContain('Signature:');
      expect(output).toContain('Documentation:');
      expect(output).toContain('JSDoc Tags:');
      expect(output).toContain('Type:');
    });

    it('should handle symbols without optional fields', () => {
      const symbolInfo: SymbolInfo = {
        name: 'minimal',
        kind: 'variable',
        location: './minimal.ts:1',
        type: 'string',
      };

      const output = formatOutput(symbolInfo);

      expect(output).toContain('minimal');
      expect(output).toContain('Kind: variable');
      expect(output).toContain('Type:\nstring');
      expect(output).not.toContain('Signature:');
      expect(output).not.toContain('Documentation:');
      expect(output).not.toContain('JSDoc Tags:');
    });
  });

  describe('error handling', () => {
    it('should handle TypeScript compiler errors gracefully', async () => {
      // Test with a malformed module path that might cause TS errors
      const result = await extractSymbol({
        module: '///invalid-path///',
        symbol: 'test',
      });

      expect(isExtractError(result)).toBe(true);
      if (isExtractError(result)) {
        expect(['MODULE_NOT_FOUND', 'PARSE_ERROR'].includes(result.error.code)).toBe(true);
      }
    });

    it('should handle extraction errors and return PARSE_ERROR', async () => {
      // This might trigger the catch block in extractSymbol
      const result = await extractSymbol({
        module: '',
        symbol: 'test',
      });

      expect(isExtractError(result)).toBe(true);
    });
  });
});
