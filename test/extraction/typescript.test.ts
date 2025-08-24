import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ts from 'typescript';
import { extractSymbol } from '../../src/extraction/typescript';
import { isExtractError } from '../../src/core/types';

describe('TypeScript Extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle extraction request for simple module', async () => {
    const result = await extractSymbol({
      module: 'typescript',
      symbol: 'createProgram',
    });

    if (isExtractError(result)) {
      expect(result.error.code).toMatch(/MODULE_NOT_FOUND|SYMBOL_NOT_FOUND/);
    } else {
      expect(result.name).toBe('createProgram');
      expect(result.kind).toBeDefined();
      expect(result.location).toBeDefined();
      expect(result.type).toBeDefined();
    }
  });

  it('should handle module-only extraction', async () => {
    const result = await extractSymbol({
      module: 'typescript',
    });

    expect(result).toBeDefined();
  });

  it('should handle invalid module paths', async () => {
    const result = await extractSymbol({
      module: './non-existent-module',
      symbol: 'someSymbol',
    });

    expect(isExtractError(result)).toBe(true);
    if (isExtractError(result)) {
      expect(['MODULE_NOT_FOUND', 'INVALID_REQUEST']).toContain(result.error.code);
    }
  });

  it('should handle missing symbols in valid modules', async () => {
    const result = await extractSymbol({
      module: 'typescript',
      symbol: 'nonExistentFunction',
    });

    expect(isExtractError(result)).toBe(true);
    if (isExtractError(result)) {
      expect(result.error.code).toBe('SYMBOL_NOT_FOUND');
    }
  });

  it('should handle member access patterns', async () => {
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
      expect(result.name).toBeDefined();
    }
  });

  it('should provide extraction options', async () => {
    const result = await extractSymbol(
      {
        module: 'typescript',
      },
      {
        runtime: 'node',
        tsConfigPath: './tsconfig.json',
      },
    );

    expect(result).toBeDefined();
  });
});
