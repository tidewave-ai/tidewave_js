// src/config-loader.ts
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import findUp from 'find-up';

export interface TidewaveConfig {
  allowRemoteAccess?: boolean;
  allowedOrigins?: string[];
  port?: number;
  host?: string;
}

const CONFIG_FILENAMES = ['tidewave.config.js', 'tidewave.config.cjs', 'tidewave.config.mjs'];

const requireCJS = createRequire(import.meta.url);

/**
 * Load a config file (CJS first, ESM fallback).
 */
async function loadModule(filePath: string): Promise<unknown> {
  const fileURL = pathToFileURL(filePath);
  const stat = await fs.stat(filePath);
  const mtime = stat.mtime.getTime();

  try {
    // Try CommonJS first
    const resolved = requireCJS.resolve(filePath);
    if (requireCJS.cache?.[resolved]) delete requireCJS.cache[resolved];
    // unknown → safe cast later
    const mod: unknown = requireCJS(filePath);
    return (mod as { default?: unknown })?.default ?? mod;
  } catch (err) {
    // If ESM only, fallback to dynamic import
    if (err instanceof Error) {
      const isEsm = 'code' in err && (err as { code?: string }).code === 'ERR_REQUIRE_ESM';
      if (isEsm || /must use import/i.test(err.message)) {
        const importUrl = new URL(fileURL.href);
        importUrl.searchParams.set('mtime', String(mtime));
        const mod = await import(importUrl.href);
        return (mod as { default?: unknown }).default ?? mod;
      }
    }
    throw err;
  }
}

/**
 * Main loader:
 * - Looks up config file upward from cwd unless overridden.
 * - Merges defaultConfig + loaded config (shallow).
 */
export async function loadConfig(
  defaultConfig: TidewaveConfig,
  options?: { cwd?: string; configFile?: string | false },
): Promise<TidewaveConfig> {
  const cwd = options?.cwd ?? process.cwd();
  if (options?.configFile === false) return defaultConfig;

  let configPath: string | undefined;
  if (typeof options?.configFile === 'string') {
    configPath = path.resolve(cwd, options.configFile);
  } else {
    configPath = await findUp(CONFIG_FILENAMES, { cwd });
  }

  if (!configPath) return defaultConfig;

  try {
    const raw = await loadModule(configPath);
    const loaded = typeof raw === 'function' ? await (raw as () => unknown)() : raw;
    return { ...defaultConfig, ...(loaded as object) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`tidewave: failed to load ${configPath}: ${msg}`);
    return defaultConfig;
  }
}
