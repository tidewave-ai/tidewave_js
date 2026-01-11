import ts from 'typescript';
import path from 'path';
import fs from 'fs/promises';
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

export interface EvaluationRequest {
  code: string;
  args: unknown[];
  timeout: number;
}

export interface EvaluatedModuleResult {
  success: boolean;
  result: string | null;
  stdout: string;
  stderr: string;
}

export interface ExportInfo {
  readonly name: string;
  readonly line: number;
}

export interface GetExportsInfo {
  readonly exports: ExportInfo[];
}

export type ResolveResult = ResolvedModule | ResolveError;
export type ExtractResult = SymbolInfo | ExtractError;
export type GetExportsResult = GetExportsInfo | ExtractError;
export type InternalResolveResult = InternalResolvedModule | ResolveError;

export function isResolveError(
  result: ResolveResult | InternalResolveResult,
): result is ResolveError {
  return result != null && 'success' in result && result.success === false;
}

export function isExtractError(result: ExtractResult): result is ExtractError {
  return result != null && 'error' in result;
}

export function isExportsError(result: GetExportsResult): result is ExtractError {
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

export interface TidewaveConfig {
  port?: number;
  host?: string;
  clientUrl?: string;
  allowRemoteAccess?: boolean;
  allowedOrigins?: string[];
  projectName?: string;
  framework?: string;
  team?: {
    id?: string;
    token?: string;
  };
}

export async function getProjectName(defaultName = 'app'): Promise<string> {
  if (typeof process === 'undefined' || !process.cwd) {
    return defaultName;
  }

  const rootDir = process.cwd();
  const packageJsonPath = path.join(rootDir, 'package.json');
  try {
    const packageJson = await fs.readFile(packageJsonPath, 'utf8');
    const { name } = JSON.parse(packageJson);
    return name || defaultName;
  } catch {
    return defaultName;
  }
}
