import ts from 'typescript';

export type Program = ts.Program;
export type TypeChecker = ts.TypeChecker;
export type SourceFile = ts.SourceFile;

export type Runtime = 'node' | 'bun' | 'deno';

export interface ModuleRequest {
  readonly specifier: string;
  readonly source: string;
  readonly runtime?: Runtime;
}

export interface ResolvedModule {
  readonly path: string;
  readonly format: 'commonjs' | 'module' | 'typescript';
  readonly content?: string;
}

// Internal type for module resolution with TypeScript program
export interface InternalResolvedModule {
  readonly sourceFile: ts.SourceFile;
  readonly program: ts.Program;
}

export interface ExtractionRequest {
  readonly module: string;
  readonly symbol: string;
  readonly member?: string;
  readonly isStatic?: boolean;
}

export interface SymbolInfo {
  readonly name: string;
  readonly kind: string;
  readonly type: string;
  readonly documentation?: string;
  readonly signature?: string;
  readonly location: string;
  readonly jsDoc?: string;
}

export interface ExtractorOptions {
  readonly prefix?: string;
}

export interface ResolveError {
  readonly success: false;
  readonly error: {
    readonly code: 'MODULE_NOT_FOUND' | 'INVALID_SPECIFIER' | 'RESOLUTION_FAILED';
    readonly message: string;
    readonly details?: unknown;
  };
}

export interface ExtractError {
  readonly error: {
    readonly code:
      | 'SYMBOL_NOT_FOUND'
      | 'PARSE_ERROR'
      | 'INVALID_REQUEST'
      | 'MODULE_NOT_FOUND'
      | 'MEMBER_NOT_FOUND'
      | 'TYPE_ERROR';
    readonly message: string;
    readonly details?: unknown;
  };
}

export type EvalArguments = {
  [key: string]: unknown;
};

export interface EvaluationRequest {
  code: string;
  args: EvalArguments;
  timeout: number;
}

export interface EvaluatedModuleResult {
  success: boolean;
  result: string;
  stdout: string;
  stderr: string;
}

export type ResolveResult = ResolvedModule | ResolveError;
export type ExtractResult = SymbolInfo | ExtractError;
export type InternalResolveResult = InternalResolvedModule | ResolveError;

export function isError(result: ResolveResult | ExtractResult): boolean {
  return result != null && 'success' in result && result.success === false;
}

export function isResolveError(
  result: ResolveResult | InternalResolveResult,
): result is ResolveError {
  return result != null && 'success' in result && result.success === false;
}

export function isExtractError(result: ExtractResult): result is ExtractError {
  return result != null && 'error' in result;
}

export function resolveError(
  specifier: ModuleRequest['specifier'],
  source: ModuleRequest['source'],
): ResolveError {
  return {
    success: false,
    error: {
      code: 'MODULE_NOT_FOUND',
      message: `Cannot resolve module '${specifier}' from '${source}'`,
    },
  };
}

export function createExtractError(
  code: ExtractError['error']['code'],
  message: string,
  details?: unknown,
): ExtractError {
  return {
    error: {
      code,
      message,
      details,
    },
  };
}
