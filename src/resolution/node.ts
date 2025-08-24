import path from 'node:path';
import fs from 'node:fs/promises';

import { resolveError } from '../core/types';
import type { ModuleRequest, ResolveResult, ResolvedModule } from '../core/types';
import { getCacheKey } from './base';

const cache = new Map<string, ResolvedModule>();

// File extension resolution order
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveWithExtensions(basePath: string): Promise<string | null> {
  if (await fileExists(basePath)) return basePath;

  // try with different extensions
  for (const ext of EXTENSIONS) {
    if (await fileExists(basePath + ext)) return basePath + ext;
  }

  // try index files
  for (const ext of EXTENSIONS) {
    const indexPath = path.join(basePath, 'index' + ext);
    if (await fileExists(indexPath)) return indexPath;
  }

  return null;
}

function detectFormat(filePath: string): ResolvedModule['format'] {
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'typescript';
  if (filePath.endsWith('.mjs')) return 'module';

  // TODO: check package.json
  return 'commonjs';
}

function isRelativeImport(specifier: ModuleRequest['specifier']): boolean {
  return specifier.startsWith('.') || specifier.startsWith('/');
}

async function resolveDependency(
  currentDir: string,
  specifier: ModuleRequest['specifier'],
  source: ModuleRequest['source'],
): Promise<string | null> {
  if (currentDir === path.dirname(currentDir)) return currentDir;

  const nodeModulesPath = path.join(currentDir, 'node_modules', specifier);
  const packageJsonPath = path.join(nodeModulesPath, 'package.json');

  if (!(await fileExists(packageJsonPath))) return null;

  try {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
    const main = packageJson.main || 'index.js';
    const resolvedPath = await resolveWithExtensions(path.join(nodeModulesPath, main));
    if (resolvedPath) return resolvedPath;
  } catch {
    return null;
  }

  return resolveDependency(path.dirname(currentDir), specifier, source);
}

export async function resolveModule(request: ModuleRequest): Promise<ResolveResult> {
  const cacheKey = getCacheKey(request);

  if (cache.has(cacheKey)) return cache.get(cacheKey) as ResolvedModule;
  try {
    const { specifier, source } = request;

    if (isRelativeImport(specifier)) {
      const basePath = path.resolve(path.dirname(source), specifier);
      const resolvedPath = await resolveWithExtensions(basePath);
      if (!resolvedPath) return resolveError(specifier, source);
      const resolved = { path: resolvedPath, format: detectFormat(resolvedPath) };
      cache.set(cacheKey, resolved);
      return resolved;
    }

    // handle dependencies
    const currentDir = path.dirname(source);
    const resolvedPath = await resolveDependency(currentDir, specifier, source);
    if (!resolvedPath) return resolveError(specifier, source);
    const resolved = { path: resolvedPath, format: detectFormat(resolvedPath) };
    cache.set(cacheKey, resolved);
    return resolved;
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'RESOLUTION_FAILED',
        message: 'Failed to resolve module',
        details: error,
      },
    };
  }
}

export function canResolveNode(request: ModuleRequest): boolean {
  // For MVP, handle all requests as Node.js
  return request.runtime === undefined || request.runtime === 'node';
}
