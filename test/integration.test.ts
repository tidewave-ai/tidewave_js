import { describe, it, expect } from 'vitest';
import { Tidewave } from '../src/index';
import {
  isExtractError,
  isResolveError,
  isFileInfo,
  type EvaluationRequest,
  type ResolvedModule,
  type SymbolInfo,
  type FileInfo,
} from '../src/core';

describe('Integration Tests', () => {
  describe('JavaScript Files', () => {
    it('should extract function from CommonJS export', async () => {
      const result = (await Tidewave.extractDocs(
        './test/fixtures/sample.js:greetUser',
      )) as SymbolInfo;

      expect(result.name).toBe('greetUser');
      expect(result.kind).toBe('function');
      expect(result.documentation).toContain('A sample function for testing');
      expect(result.jsDoc).toContain('@param name');
      expect(result.jsDoc).toContain('@returns A greeting message');
      expect(result.location).toContain('sample.js');
    });

    it('should extract class from CommonJS export', async () => {
      const result = (await Tidewave.extractDocs(
        './test/fixtures/sample.js:TestClass',
      )) as SymbolInfo;

      expect(result.name).toBe('TestClass');
      expect(result.kind).toBe('class');
      expect(result.documentation).toContain('A sample class for testing');
      expect(result.location).toContain('sample.js');
    });

    it('should extract instance method from JavaScript class', async () => {
      const result = (await Tidewave.extractDocs(
        './test/fixtures/sample.js:TestClass#getValue',
      )) as SymbolInfo;

      expect(result.name).toBe('TestClass#getValue');
      expect(result.kind).toBe('method');
      expect(result.documentation).toContain('Get the value');
      expect(result.jsDoc).toContain('@returns The current value');
    });

    it('should extract static method from JavaScript class', async () => {
      const result = (await Tidewave.extractDocs(
        './test/fixtures/sample.js:TestClass.create',
      )) as SymbolInfo;

      expect(result.name).toBe('TestClass.create');
      expect(result.kind).toBe('method');
      expect(result.documentation).toContain('Static factory method');
      expect(result.jsDoc).toContain('@returns New instance');
    });
  });

  describe('TypeScript Files', () => {
    it('should extract interface from TypeScript export', async () => {
      const result = (await Tidewave.extractDocs('./test/fixtures/sample.ts:User')) as SymbolInfo;

      expect(result.name).toBe('User');
      expect(result.kind).toBe('interface');
      expect(result.documentation).toContain('A sample TypeScript interface');
      expect(result.location).toContain('sample.ts');
    });

    it('should extract class from TypeScript export', async () => {
      const result = (await Tidewave.extractDocs(
        './test/fixtures/sample.ts:UserManager',
      )) as SymbolInfo;

      expect(result.name).toBe('UserManager');
      expect(result.kind).toBe('class');
      expect(result.documentation).toContain('A sample TypeScript class');
    });

    it('should extract instance method from TypeScript class', async () => {
      const result = (await Tidewave.extractDocs(
        './test/fixtures/sample.ts:UserManager#addUser',
      )) as SymbolInfo;

      expect(result.name).toBe('UserManager#addUser');
      expect(result.kind).toBe('method');
      expect(result.documentation).toContain('Add a user');
    });

    it('should extract static method from TypeScript class', async () => {
      const result = (await Tidewave.extractDocs(
        './test/fixtures/sample.ts:UserManager.create',
      )) as SymbolInfo;

      expect(result.name).toBe('UserManager.create');
      expect(result.kind).toBe('method');
      expect(result.documentation).toContain('Static factory method');
    });

    it('should extract generic function', async () => {
      const result = (await Tidewave.extractDocs(
        './test/fixtures/sample.ts:processItems',
      )) as SymbolInfo;

      expect(result.name).toBe('processItems');
      expect(result.kind).toBe('function');
      expect(result.documentation).toContain('Sample utility function');
      expect(result.signature).toContain('processItems');
    });
  });

  describe('Source Path Resolution', () => {
    it('should resolve JavaScript file path', async () => {
      const sourcePath = (await Tidewave.getSourceLocation(
        './test/fixtures/sample.js',
      )) as ResolvedModule;

      expect(sourcePath.path).toContain('test/fixtures/sample.js');
    });

    it('should resolve TypeScript file path', async () => {
      const sourcePath = (await Tidewave.getSourceLocation(
        './test/fixtures/sample.ts',
      )) as ResolvedModule;

      expect(sourcePath.path).toContain('test/fixtures/sample.ts');
    });

    it('should resolve node_modules dependency', async () => {
      const sourcePath = (await Tidewave.getSourceLocation('typescript')) as ResolvedModule;

      expect(sourcePath.path).toMatch(/typescript.*\.d\.ts$/);
    });
  });

  describe('Builtin Modules', () => {
    it('should extract Math global', async () => {
      const result = (await Tidewave.extractDocs('node:Math')) as SymbolInfo;

      expect(result.name).toBe('Math');
      expect(result.kind).toBe('interface');
      expect(result.documentation).toContain('mathematics functionality');
    });

    it('should extract Math.max static method', async () => {
      const result = (await Tidewave.extractDocs('node:Math.max')) as SymbolInfo;

      expect(result.name).toBe('Math.max');
      expect(result.kind).toBe('method');
      expect(result.documentation).toContain('Returns the larger of a set');
      expect(result.signature).toContain('(...values: number[]): number');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid module path format', async () => {
      const result = await Tidewave.extractDocs('invalid-format');

      expect(isExtractError(result)).toBe(true);
    });

    it('should handle non-existent module', async () => {
      const result = await Tidewave.extractDocs('non-existent-module:symbol');

      expect(isExtractError(result)).toBe(true);
    });

    it('should handle non-existent symbol', async () => {
      const result = await Tidewave.extractDocs('./test/fixtures/sample.ts:NonExistentSymbol');

      expect(isExtractError(result)).toBe(true);
    });

    it('should handle non-existent member', async () => {
      const result = await Tidewave.extractDocs(
        './test/fixtures/sample.ts:UserManager#nonExistentMethod',
      );

      expect(isExtractError(result)).toBe(true);
    });
  });

  describe('Output Formatting', () => {
    it('should format symbol info correctly', async () => {
      const result = (await Tidewave.extractDocs('./test/fixtures/sample.ts:User')) as SymbolInfo;

      const formatted = Tidewave.formatOutput(result);
      expect(formatted).toContain('User');
      expect(formatted).toContain('Kind: interface');
      expect(formatted).toContain('Location:');
      expect(formatted).toContain('Type:');
      expect(formatted).toContain('Documentation:');
    });

    it('should format function with signature', async () => {
      const result = (await Tidewave.extractDocs(
        './test/fixtures/sample.ts:processItems',
      )) as SymbolInfo;

      const formatted = Tidewave.formatOutput(result);
      expect(formatted).toContain('processItems');
      expect(formatted).toContain('Signature:');
      expect(formatted).toContain('processItems');
    });
  });
});

describe('Project scoped evaluation', () => {
  it('should fork the process correcly and finish execution', async () => {
    const request: EvaluationRequest = {
      args: [],
      timeout: 1_000,
      code: "console.log('hello, world!');",
    };

    const result = await Tidewave.executeIsolated(request);
    expect(result.success).toBe(true);
    expect(result.stderr).toBeFalsy();
    expect(result.result).toBe(null);
    expect(result.stdout).toBe('hello, world!\n');
  });

  it('should fork the process and return a custom result', async () => {
    const request: EvaluationRequest = {
      args: [],
      timeout: 1_000,
      code: `
        console.log('hello, world!');
        return 42;
      `,
    };

    const result = await Tidewave.executeIsolated(request);
    expect(result.success).toBe(true);
    expect(result.stderr).toBeFalsy();
    expect(result.stdout).toBe('hello, world!\n');
    expect(result.result).toBe(42);
  });

  it('should fork the process and respect the timeout', async () => {
    const request: EvaluationRequest = {
      args: [],
      timeout: 1,
      code: "console.log('hello, world!');",
    };

    const result = await Tidewave.executeIsolated(request);
    expect(result.success).toBe(false);
    expect(result.stderr).toBeFalsy();
    expect(result.stdout).toBeFalsy();
    expect(result.result).toBe('Evaluation timed out after 1 milliseconds');
  });

  it('should fork the process and finish the program with args', async () => {
    const request: EvaluationRequest = {
      args: [42],
      timeout: 10_000,
      code: `
      const digit = arguments[0]
      console.log(\`Code is: $\{digit}\`);
      return (new Number(digit) + 1);
      `,
    };

    const result = await Tidewave.executeIsolated(request);
    expect(result.success).toBe(true);
    expect(result.stderr).toBeFalsy();
    expect(result.stdout).toBe('Code is: 42\n');
    expect(result.result).toBe(43);
  });

  it('should fork the process and finish the program with imports', async () => {
    const request: EvaluationRequest = {
      args: [],
      timeout: 10_000,
      code: `
      const {resolve} = await import('node:path');
      const path = resolve(process.cwd());

      console.log(JSON.stringify({a: 1}));
      console.log(\`Global length: \${Object.keys(global).length > 0}\`);

      return path;
      `,
    };

    const result = await Tidewave.executeIsolated(request);
    expect(result.success).toBe(true);
    expect(result.stderr).toBeFalsy();
    expect(result.stdout).toContain('{"a":1}');
    expect(result.stdout).toContain('Global length: true');
    expect(result.result).toContain(process.cwd());
  });
});

describe('File-level Documentation', () => {
  it('should extract file overview and list all symbols', async () => {
    const result = (await Tidewave.extractDocs(
      './test/fixtures/file-overview-sample.ts',
    )) as FileInfo;

    // Check file path
    expect(result.path).toContain('test/fixtures/file-overview-sample.ts');

    // Check overview
    expect(result.overview).toBeDefined();
    expect(result.overview).toContain('Sample module demonstrating file-level documentation');
    expect(result.overview).toContain(
      'This module contains utility functions for common operations',
    );

    // Check exports count
    expect(result.exportCount).toBe(7);
    expect(result.exports.length).toBe(7);

    // Check each export in order (sorted by line number)
    expect(result.exports[0]).toEqual({
      name: 'greet',
      kind: 'function',
      line: 14,
      documentation: 'Greets a person with a personalized message',
    });

    expect(result.exports[1]).toEqual({
      name: 'add',
      kind: 'function',
      line: 21,
      documentation: 'Adds two numbers together',
    });

    expect(result.exports[2]).toEqual({
      name: 'VERSION',
      kind: 'variable',
      line: 26,
      documentation: undefined,
    });

    expect(result.exports[3]).toEqual({
      name: 'Config',
      kind: 'interface',
      line: 31,
      documentation: 'Configuration interface for the service',
    });

    expect(result.exports[4]).toEqual({
      name: 'User',
      kind: 'type',
      line: 39,
      documentation: 'User type alias',
    });

    expect(result.exports[5]).toEqual({
      name: 'Status',
      kind: 'enum',
      line: 47,
      documentation: 'Status enumeration',
    });

    expect(result.exports[6]).toEqual({
      name: 'Calculator',
      kind: 'class',
      line: 56,
      documentation: 'A simple class for demonstration',
    });
  });

  it('should handle file without overview', async () => {
    const result = (await Tidewave.extractDocs('./test/fixtures/sample.ts')) as FileInfo;
    expect(result.overview).toBeUndefined();
    expect(result.exports.length).toBeGreaterThan(0);
  });

  it('should handle empty file path error', async () => {
    const result = await Tidewave.extractDocs('');

    if (isExtractError(result)) {
      expect(result.error.code).toBe('INVALID_REQUEST');
    } else {
      throw 'expected ExtractError';
    }
  });

  it('should handle path with colon but no symbol', async () => {
    const result = await Tidewave.extractDocs('./test/fixtures/file-overview-sample.ts:');

    if (isExtractError(result)) {
      expect(result.error.code).toBe('INVALID_REQUEST');
    } else {
      throw 'expected ExtractError';
    }
  });
});
