import { describe, it, expect } from 'vitest';
import { Tidewave } from '../src/index';
import {
  isExtractError,
  isResolveError,
  isExportsError,
  type EvaluationRequest,
  type GetExportsInfo,
} from '../src/core';

describe('Integration Tests', () => {
  describe('JavaScript Files', () => {
    it('should extract function from CommonJS export', async () => {
      const result = await Tidewave.extractDocs('./test/fixtures/sample.js:greetUser');

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
      const result = await Tidewave.extractDocs('./test/fixtures/sample.js:TestClass');

      expect(isExtractError(result)).toBe(false);
      if (!isExtractError(result)) {
        expect(result.name).toBe('TestClass');
        expect(result.kind).toBe('class');
        expect(result.documentation).toContain('A sample class for testing');
        expect(result.location).toContain('sample.js');
      }
    });

    it('should extract instance method from JavaScript class', async () => {
      const result = await Tidewave.extractDocs('./test/fixtures/sample.js:TestClass#getValue');

      expect(isExtractError(result)).toBe(false);
      if (!isExtractError(result)) {
        expect(result.name).toBe('TestClass#getValue');
        expect(result.kind).toBe('method');
        expect(result.documentation).toContain('Get the value');
        expect(result.jsDoc).toContain('@returns The current value');
      }
    });

    it('should extract static method from JavaScript class', async () => {
      const result = await Tidewave.extractDocs('./test/fixtures/sample.js:TestClass.create');

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
      const result = await Tidewave.extractDocs('./test/fixtures/sample.ts:User');

      expect(isExtractError(result)).toBe(false);
      if (!isExtractError(result)) {
        expect(result.name).toBe('User');
        expect(result.kind).toBe('interface');
        expect(result.documentation).toContain('A sample TypeScript interface');
        expect(result.location).toContain('sample.ts');
      }
    });

    it('should extract class from TypeScript export', async () => {
      const result = await Tidewave.extractDocs('./test/fixtures/sample.ts:UserManager');

      expect(isExtractError(result)).toBe(false);
      if (!isExtractError(result)) {
        expect(result.name).toBe('UserManager');
        expect(result.kind).toBe('class');
        expect(result.documentation).toContain('A sample TypeScript class');
      }
    });

    it('should extract instance method from TypeScript class', async () => {
      const result = await Tidewave.extractDocs('./test/fixtures/sample.ts:UserManager#addUser');

      expect(isExtractError(result)).toBe(false);
      if (!isExtractError(result)) {
        expect(result.name).toBe('UserManager#addUser');
        expect(result.kind).toBe('method');
        expect(result.documentation).toContain('Add a user');
      }
    });

    it('should extract static method from TypeScript class', async () => {
      const result = await Tidewave.extractDocs('./test/fixtures/sample.ts:UserManager.create');

      expect(isExtractError(result)).toBe(false);
      if (!isExtractError(result)) {
        expect(result.name).toBe('UserManager.create');
        expect(result.kind).toBe('method');
        expect(result.documentation).toContain('Static factory method');
      }
    });

    it('should extract generic function', async () => {
      const result = await Tidewave.extractDocs('./test/fixtures/sample.ts:processItems');

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
      const sourcePath = await Tidewave.getSourceLocation('./test/fixtures/sample.js');

      expect(isResolveError(sourcePath)).toBe(false);
      if (!isResolveError(sourcePath)) {
        expect(sourcePath.path).toContain('test/fixtures/sample.js');
      }
    });

    it('should resolve TypeScript file path', async () => {
      const sourcePath = await Tidewave.getSourceLocation('./test/fixtures/sample.ts');

      expect(isResolveError(sourcePath)).toBe(false);
      if (!isResolveError(sourcePath)) {
        expect(sourcePath.path).toContain('test/fixtures/sample.ts');
      }
    });

    it('should resolve node_modules dependency', async () => {
      const sourcePath = await Tidewave.getSourceLocation('typescript');

      expect(isResolveError(sourcePath)).toBe(false);
      if (!isResolveError(sourcePath)) {
        expect(sourcePath.path).toMatch(/typescript.*\.d\.ts$/);
      }
    });
  });

  describe('Builtin Modules', () => {
    it('should extract Math global', async () => {
      const result = await Tidewave.extractDocs('node:Math');

      expect(isExtractError(result)).toBe(false);
      if (!isExtractError(result)) {
        expect(result.name).toBe('Math');
        expect(result.kind).toBe('interface');
        expect(result.documentation).toContain('mathematics functionality');
      }
    });

    it('should extract Math.max static method', async () => {
      const result = await Tidewave.extractDocs('node:Math.max');

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
      const result = await Tidewave.extractDocs('./test/fixtures/sample.ts:User');

      expect(isExtractError(result)).toBe(false);
      if (!isExtractError(result)) {
        const formatted = Tidewave.formatOutput(result);

        expect(formatted).toContain('User');
        expect(formatted).toContain('Kind: interface');
        expect(formatted).toContain('Location:');
        expect(formatted).toContain('Type:');
        expect(formatted).toContain('Documentation:');
      }
    });

    it('should format function with signature', async () => {
      const result = await Tidewave.extractDocs('./test/fixtures/sample.ts:processItems');

      expect(isExtractError(result)).toBe(false);
      if (!isExtractError(result)) {
        const formatted = Tidewave.formatOutput(result);

        expect(formatted).toContain('processItems');
        expect(formatted).toContain('Signature:');
        expect(formatted).toContain('processItems');
      }
    });
  });
});

describe('Get Exports', () => {
  it('should list all exports with line numbers', async () => {
    const { exports } = (await Tidewave.getExports(
      './test/fixtures/exports-sample.ts',
    )) as GetExportsInfo;

    // Assert each export individually, in order by line number
    expect(exports[0]).toEqual({ name: 'CONSTANT_STRING', line: 2 });
    expect(exports[1]).toEqual({ name: 'CONSTANT_NUMBER', line: 3 });
    expect(exports[2]).toEqual({ name: 'mutableVariable', line: 6 });
    expect(exports[3]).toEqual({ name: 'namedFunction', line: 9 });
    expect(exports[4]).toEqual({ name: 'asyncFunction', line: 10 });
    expect(exports[5]).toEqual({ name: 'genericFunction', line: 11 });
    expect(exports[6]).toEqual({ name: 'arrowFunction', line: 16 });
    expect(exports[7]).toEqual({ name: 'SimpleClass', line: 19 });
    expect(exports[8]).toEqual({ name: 'AbstractClass', line: 20 });
    expect(exports[9]).toEqual({ name: 'SimpleInterface', line: 25 });
    expect(exports[10]).toEqual({ name: 'SimpleType', line: 30 });
    expect(exports[11]).toEqual({ name: 'UnionType', line: 31 });
    expect(exports[12]).toEqual({ name: 'GenericType', line: 32 });
    expect(exports[13]).toEqual({ name: 'SimpleEnum', line: 35 });
    expect(exports[14]).toEqual({ name: 'ConstEnum', line: 40 });
    expect(exports[15]).toEqual({ name: 'MyNamespace', line: 47 });
    expect(exports.length).toBe(16);
  });

  it('should handle non-existent module', async () => {
    const result = await Tidewave.getExports('non-existent-module');

    expect(isExportsError(result)).toBe(true);
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
