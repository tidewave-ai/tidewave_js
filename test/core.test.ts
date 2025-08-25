import { describe, it, expect } from 'vitest';
import { isExtractError, createExtractError } from '../src/core';
import type { SymbolInfo, ExtractionRequest, ExtractError } from '../src/core';

describe('Core Types', () => {
  describe('isExtractError', () => {
    it('should identify ExtractError objects', () => {
      const error: ExtractError = {
        error: {
          code: 'MODULE_NOT_FOUND',
          message: 'Module not found',
        },
      };

      expect(isExtractError(error)).toBe(true);
    });

    it('should reject SymbolInfo objects', () => {
      const symbolInfo: SymbolInfo = {
        name: 'test',
        kind: 'function',
        location: './test.ts:10',
        type: 'string',
      };

      expect(isExtractError(symbolInfo)).toBe(false);
    });

    it('should reject null and undefined', () => {
      expect(isExtractError(null)).toBe(false);
      expect(isExtractError(undefined)).toBe(false);
    });

    it('should reject plain objects without error property', () => {
      expect(isExtractError({ name: 'test' })).toBe(false);
      expect(isExtractError({ message: 'error' })).toBe(false);
    });
  });

  describe('createExtractError', () => {
    it('should create MODULE_NOT_FOUND error', () => {
      const error = createExtractError('MODULE_NOT_FOUND', 'Cannot resolve module');

      expect(error.error.code).toBe('MODULE_NOT_FOUND');
      expect(error.error.message).toBe('Cannot resolve module');
      expect(error.error.details).toBeUndefined();
    });

    it('should create SYMBOL_NOT_FOUND error with details', () => {
      const error = createExtractError(
        'SYMBOL_NOT_FOUND',
        'Symbol not found',
        'Additional context',
      );

      expect(error.error.code).toBe('SYMBOL_NOT_FOUND');
      expect(error.error.message).toBe('Symbol not found');
      expect(error.error.details).toBe('Additional context');
    });

    it('should create MEMBER_NOT_FOUND error', () => {
      const error = createExtractError('MEMBER_NOT_FOUND', 'Member does not exist');

      expect(error.error.code).toBe('MEMBER_NOT_FOUND');
      expect(error.error.message).toBe('Member does not exist');
    });

    it('should create TYPE_ERROR', () => {
      const error = createExtractError('TYPE_ERROR', 'Type analysis failed');

      expect(error.error.code).toBe('TYPE_ERROR');
      expect(error.error.message).toBe('Type analysis failed');
    });

    it('should create PARSE_ERROR', () => {
      const error = createExtractError('PARSE_ERROR', 'Failed to parse source');

      expect(error.error.code).toBe('PARSE_ERROR');
      expect(error.error.message).toBe('Failed to parse source');
    });
  });

  describe('ExtractionRequest', () => {
    it('should support module-only requests', () => {
      const request: ExtractionRequest = {
        module: 'lodash',
      };

      expect(request.module).toBe('lodash');
      expect(request.symbol).toBeUndefined();
      expect(request.member).toBeUndefined();
      expect(request.isStatic).toBeUndefined();
    });

    it('should support symbol extraction requests', () => {
      const request: ExtractionRequest = {
        module: './utils',
        symbol: 'formatDate',
      };

      expect(request.module).toBe('./utils');
      expect(request.symbol).toBe('formatDate');
    });

    it('should support member access requests', () => {
      const request: ExtractionRequest = {
        module: './api',
        symbol: 'HttpClient',
        member: 'get',
        isStatic: false,
      };

      expect(request.module).toBe('./api');
      expect(request.symbol).toBe('HttpClient');
      expect(request.member).toBe('get');
      expect(request.isStatic).toBe(false);
    });

    it('should support static member requests', () => {
      const request: ExtractionRequest = {
        module: './math',
        symbol: 'Calculator',
        member: 'PI',
        isStatic: true,
      };

      expect(request.isStatic).toBe(true);
    });
  });

  describe('SymbolInfo', () => {
    it('should create basic symbol info', () => {
      const info: SymbolInfo = {
        name: 'myFunction',
        kind: 'function',
        location: './src/index.ts:42',
        type: '(x: number) => string',
      };

      expect(info.name).toBe('myFunction');
      expect(info.kind).toBe('function');
      expect(info.location).toBe('./src/index.ts:42');
      expect(info.type).toBe('(x: number) => string');
    });

    it('should support optional properties', () => {
      const info: SymbolInfo = {
        name: 'MyClass',
        kind: 'class',
        location: './src/MyClass.ts:1',
        type: 'typeof MyClass',
        signature: 'class MyClass',
        documentation: 'A utility class',
        jsDoc: '@since 1.0.0',
      };

      expect(info.signature).toBe('class MyClass');
      expect(info.documentation).toBe('A utility class');
      expect(info.jsDoc).toBe('@since 1.0.0');
    });
  });
});
