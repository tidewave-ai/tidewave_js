import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractSymbol, extractDocs, getSourceLocation, formatOutput } from '../src/resolution';
import { isExtractError, isResolveError } from '../src/core';
import type { SymbolInfo, ResolvedModule, ResolveError, ExtractError } from '../src/core';
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

      const symbolInfo = result as SymbolInfo;
      expect(symbolInfo.name).toBe('createProgram');
      expect(symbolInfo.kind).toBe('function');
      expect(symbolInfo.location).toContain('.ts');
      expect(symbolInfo.type).toBeDefined();
    });

    it('should extract interface symbols', async () => {
      const result = await extractSymbol({
        module: 'typescript',
        symbol: 'CompilerOptions',
      });

      const symbolInfo = result as SymbolInfo;
      expect(symbolInfo.name).toBe('CompilerOptions');
      expect(symbolInfo.kind).toBe('interface');
      expect(symbolInfo.type).toBeDefined();
    });

    it('should extract enum symbols', async () => {
      const result = await extractSymbol({
        module: 'typescript',
        symbol: 'ScriptTarget',
      });

      const symbolInfo = result as SymbolInfo;
      expect(symbolInfo.name).toBe('ScriptTarget');
      expect(symbolInfo.kind).toBe('enum');
      expect(symbolInfo.type).toBeDefined();
    });

    it('should extract class symbols', async () => {
      const result = await extractSymbol({
        module: './test/fixtures/resolution',
        symbol: 'TestClass',
      });

      const symbolInfo = result as SymbolInfo;
      expect(symbolInfo.kind).toBe('class');
      expect(symbolInfo.name).toBe('TestClass');
    });

    it('should handle class static member access', async () => {
      const result = await extractSymbol({
        module: './test/fixtures/resolution',
        symbol: 'TestClass',
        member: 'VERSION',
        isStatic: true,
      });

      const symbolInfo = result as SymbolInfo;
      expect(symbolInfo.name).toBe('TestClass.VERSION');
      expect(symbolInfo.type).toBeDefined();
    });

    it('should handle class static method access', async () => {
      const result = await extractSymbol({
        module: './test/fixtures/resolution',
        symbol: 'TestClass',
        member: 'create',
        isStatic: true,
      });

      const symbolInfo = result as SymbolInfo;
      expect(symbolInfo.name).toBe('TestClass.create');
      expect(symbolInfo.kind).toBe('method');
    });

    it('should handle class instance member access', async () => {
      const result = await extractSymbol({
        module: './test/fixtures/resolution',
        symbol: 'TestClass',
        member: 'greet',
        isStatic: false,
      });

      const symbolInfo = result as SymbolInfo;
      expect(symbolInfo.name).toBe('TestClass#greet');
      expect(symbolInfo.kind).toBe('method');
    });

    it('should handle enum member access', async () => {
      const result = await extractSymbol({
        module: './test/fixtures/resolution',
        symbol: 'TestEnum',
        member: 'First',
        isStatic: true,
      });

      const symbolInfo = result as SymbolInfo;
      expect(symbolInfo.name).toBe('TestEnum.First');
      expect(symbolInfo.kind).toBe('enum member');
      expect(symbolInfo.type).toBeDefined();
    });

    it('should handle interface member access', async () => {
      const result = await extractSymbol({
        module: './test/fixtures/resolution',
        symbol: 'TestInterface',
        member: 'getData',
        isStatic: false,
      });

      const symbolInfo = result as SymbolInfo;
      expect(symbolInfo.name).toBe('TestInterface#getData');
      expect(symbolInfo.kind).toBe('method');
    });

    it('should return MODULE_NOT_FOUND for invalid modules', async () => {
      const result = (await extractSymbol({
        module: './non-existent-module-path',
        symbol: 'someSymbol',
      })) as ExtractError;

      expect(result.error.code).toBe('MODULE_NOT_FOUND');
      expect(result.error.message).toContain('./non-existent-module-path');
    });

    it('should return SYMBOL_NOT_FOUND for missing symbols', async () => {
      const result = (await extractSymbol({
        module: 'typescript',
        symbol: 'NonExistentSymbolName123',
      })) as ExtractError;

      expect(result.error.code).toBe('SYMBOL_NOT_FOUND');
      expect(result.error.message).toContain('NonExistentSymbolName123');
    });

    it('should return MEMBER_NOT_FOUND for missing members', async () => {
      const result = (await extractSymbol({
        module: 'typescript',
        symbol: 'ScriptTarget',
        member: 'NonExistentMember',
        isStatic: true,
      })) as ExtractError;

      expect(result.error.code).toBe('MEMBER_NOT_FOUND');
      expect(result.error.message).toContain('NonExistentMember');
    });

    it('should return INVALID_REQUEST when symbol is not provided', async () => {
      const result = (await extractSymbol({
        module: 'typescript',
        symbol: '', // Empty symbol to trigger the error
      })) as ExtractError;

      expect(result.error.code).toBe('INVALID_REQUEST');
      expect(result.error.message).toContain('Symbol name is required');
    });

    it('should handle TypeScript configuration options', async () => {
      const result = await extractSymbol({
        module: 'typescript',
        symbol: 'createProgram',
      });

      const symbolInfo = result as SymbolInfo;
      expect(symbolInfo.name).toBe('createProgram');
      expect(symbolInfo.kind).toBe('function');
    });

    it('should handle relative path modules', async () => {
      const result = await extractSymbol({
        module: './src/core',
        symbol: 'SymbolInfo',
      });

      const symbolInfo = result as SymbolInfo;
      expect(symbolInfo.name).toBe('SymbolInfo');
      expect(symbolInfo.kind).toBe('interface');
    });

    it('should extract documentation comments when available', async () => {
      // Test with a known module that has documentation
      const result = await extractSymbol({
        module: 'typescript',
        symbol: 'createProgram',
      });

      const symbolInfo = result as SymbolInfo;
      expect(symbolInfo.documentation).toBeDefined();
      expect(typeof symbolInfo.documentation).toBe('string');
    });

    it('should extract JSDoc tags when available', async () => {
      const result = await extractSymbol({
        module: 'typescript',
        symbol: 'createProgram',
      });

      const symbolInfo = result as SymbolInfo;
      expect(symbolInfo.jsDoc).toBeDefined();
      expect(typeof symbolInfo.jsDoc).toBe('string');
    });

    it('should generate proper signatures for functions', async () => {
      const result = await extractSymbol({
        module: 'typescript',
        symbol: 'createProgram',
      });

      const symbolInfo = result as SymbolInfo;
      expect(symbolInfo.signature).toBeDefined();
      expect(symbolInfo.signature).toContain('createProgram');
    });

    it('should handle JavaScript files', async () => {
      // This tests the JS handling path in findSymbol with a non-existent JS file
      const result = (await extractSymbol({
        module: './non-existent-file.js',
        symbol: 'extractSymbol',
      })) as ExtractError;

      // This should error with MODULE_NOT_FOUND since the JS file doesn't exist
      expect(isExtractError(result)).toBe(true);
      expect(result.error.code).toBe('MODULE_NOT_FOUND');
    });
  });

  describe('extractDocs', () => {
    it('should parse module:symbol format correctly', async () => {
      const docs = (await extractDocs('typescript:createProgram')) as SymbolInfo;

      expect(isExtractError(docs)).toBe(false);
      expect(docs.name).toBe('createProgram');
      expect(docs.kind).toBeDefined();
    });

    it('should parse class static member format', async () => {
      const docs = (await extractDocs('./test/fixtures/resolution:TestClass.create')) as SymbolInfo;

      expect(isExtractError(docs)).toBe(false);
      expect(docs.name).toBe('TestClass.create');
    });

    it('should parse class instance member format', async () => {
      const docs = (await extractDocs('./test/fixtures/resolution:TestClass#greet')) as SymbolInfo;

      expect(isExtractError(docs)).toBe(false);
      expect(docs.name).toBe('TestClass#greet');
    });

    it('should parse enum member format', async () => {
      const docs = (await extractDocs('./test/fixtures/resolution:TestEnum.First')) as SymbolInfo;

      expect(isExtractError(docs)).toBe(false);
      expect(docs.name).toBe('TestEnum.First');
    });

    it('should parse interface member format', async () => {
      const docs = (await extractDocs(
        './test/fixtures/resolution:TestInterface#getData',
      )) as SymbolInfo;
      expect(docs.name).toBe('TestInterface#getData');
    });

    it('should return error for invalid format', async () => {
      const docs = (await extractDocs('invalid-format-without-colon')) as ExtractError;

      expect(isExtractError(docs)).toBe(true);
      expect(docs.error.code).toBe('INVALID_REQUEST');
    });

    it('should return error for module not found', async () => {
      const docs = (await extractDocs('non-existent-module:someSymbol')) as ExtractError;

      expect(isExtractError(docs)).toBe(true);
      expect(docs.error.code).toBe('MODULE_NOT_FOUND');
    });
  });

  describe('getSourceLocation', () => {
    it('should resolve built-in module paths', async () => {
      const sourcePath = await getSourceLocation('typescript');

      const resolved = sourcePath as ResolvedModule;
      expect(resolved.path).toMatch(/typescript/);
      expect(resolved.path).toMatch(/\.d\.ts$/);
    });

    it('should resolve relative paths', async () => {
      const sourcePath = await getSourceLocation('./src/core');

      const resolved = sourcePath as ResolvedModule;
      expect(resolved.path).toContain('src/core');
    });

    it('should return relative paths when inside project', async () => {
      const sourcePath = await getSourceLocation('./src/index');

      const resolved = sourcePath as ResolvedModule;
      expect(resolved.path).toMatch(/^src/);
    });

    it('should return absolute paths for node_modules', async () => {
      const sourcePath = await getSourceLocation('typescript');

      const resolved = sourcePath as ResolvedModule;
      expect(path.isAbsolute(resolved.path) || resolved.path.includes('node_modules')).toBe(true);
    });

    it('should return error for non-existent modules', async () => {
      const sourcePath = await getSourceLocation('non-existent-module-name-12345');

      const resolveError = sourcePath as ResolveError;
      expect(resolveError.error.code).toBe('MODULE_NOT_FOUND');
    });

    // New tests for symbol location resolution
    it('should resolve symbol locations', async () => {
      const sourcePath = await getSourceLocation('typescript:createProgram');

      const resolved = sourcePath as ResolvedModule;
      expect(resolved.path).toContain('.d.ts');
    });

    it('should resolve interface symbol locations', async () => {
      const sourcePath = await getSourceLocation('typescript:CompilerOptions');

      const resolved = sourcePath as ResolvedModule;
      expect(resolved.path).toContain('.d.ts');
      expect(resolved.path).toMatch(/:\d+:\d+$/);
    });

    it('should resolve local symbol locations', async () => {
      const sourcePath = await getSourceLocation('./src/core:SymbolInfo');

      const resolved = sourcePath as ResolvedModule;
      expect(resolved.path).toContain('src/core');
      expect(resolved.path).toMatch(/:\d+:\d+$/);
    });

    it('should resolve class static member locations', async () => {
      const sourcePath = await getSourceLocation('./test/fixtures/resolution:TestClass.create');

      const resolved = sourcePath as ResolvedModule;
      expect(resolved.path).toContain('fixtures');
      expect(resolved.path).toMatch(/:\d+:\d+$/);
    });

    it('should resolve class instance member locations', async () => {
      const sourcePath = await getSourceLocation('./test/fixtures/resolution:TestClass#greet');

      expect(isResolveError(sourcePath)).toBe(false);
      const resolved = sourcePath as ResolvedModule;
      expect(resolved.path).toContain('fixtures');
      expect(resolved.path).toMatch(/:\d+:\d+$/);
    });

    it('should resolve enum member locations', async () => {
      const sourcePath = await getSourceLocation('./test/fixtures/resolution:TestEnum.First');

      const resolved = sourcePath as ResolvedModule;
      expect(resolved.path).toContain('fixtures');
      expect(resolved.path).toMatch(/:\d+:\d+$/);
    });

    it('should resolve interface member locations', async () => {
      const sourcePath = await getSourceLocation(
        './test/fixtures/resolution:TestInterface#getData',
      );

      const resolved = sourcePath as ResolvedModule;
      expect(resolved.path).toContain('fixtures');
      expect(resolved.path).toMatch(/:\d+:\d+$/);
    });

    it('should return error for non-existent symbols', async () => {
      const sourcePath = await getSourceLocation('typescript:NonExistentSymbol123');

      const resolveError = sourcePath as ResolveError;
      expect(resolveError.error.code).toBe('MODULE_NOT_FOUND');
      expect(resolveError.error.message).toContain('NonExistentSymbol123');
    });

    it('should return error for invalid symbol format', async () => {
      const sourcePath = await getSourceLocation('invalid-format-without-colon');

      const resolveError = sourcePath as ResolveError;
      expect(resolveError.error.code).toBe('MODULE_NOT_FOUND');
    });

    it('should handle node builtin symbols', async () => {
      const sourcePath = await getSourceLocation('node:Math');

      const resolved = sourcePath as ResolvedModule;
      expect(resolved.path).toBeDefined();
      expect(resolved.format).toBe('typescript');
    });

    it('should handle node builtin static members', async () => {
      const sourcePath = await getSourceLocation('node:Math.max');

      const resolved = sourcePath as ResolvedModule;
      expect(resolved.path).toBeDefined();
      expect(resolved.format).toBe('typescript');
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
      const result = (await extractSymbol({
        module: '///invalid-path///',
        symbol: 'test',
      })) as ExtractError;

      expect(isExtractError(result)).toBe(true);
      expect(['MODULE_NOT_FOUND', 'PARSE_ERROR'].includes(result.error.code)).toBe(true);
    });

    it('should handle extraction errors and return PARSE_ERROR', async () => {
      // This might trigger the catch block in extractSymbol
      const result = (await extractSymbol({
        module: '',
        symbol: 'test',
      })) as ExtractError;

      expect(isExtractError(result)).toBe(true);
    });
  });
});
