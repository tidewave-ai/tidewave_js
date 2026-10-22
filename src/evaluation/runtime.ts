// This module runs in the app server runtime (the Vite process or a
// separate worker), loaded through the Vite module runner.

import { AsyncLocalStorage } from 'node:async_hooks';
import { format } from 'node:util';
import type { EvaluatedModuleResult } from '../core';
import { stripAnsiCodes } from '../logger/ansi';

export const READY_EVENT = 'tidewave:ready';
export const EVAL_EVENT = 'tidewave:eval';
export const EVAL_RESULT_EVENT = 'tidewave:eval-result';

export interface EvalMessage {
  id: string;
  url: string;
  args: unknown[];
}

export interface EvalResultMessage {
  id: string;
  result: EvaluatedModuleResult;
}

type ImportModule = (url: string) => Promise<{ default: (...args: unknown[]) => unknown }>;

interface HotContext {
  on(event: string, listener: (data: EvalMessage) => void): void;
  send(event: string, data?: EvalResultMessage): void;
}

interface Output {
  stdout: string[];
  stderr: string[];
  open: boolean;
}

export function installEvalListener(hot: HotContext | undefined, importModule: ImportModule): void {
  if (!hot || !isSupportedRuntime()) return;

  hot.on(EVAL_EVENT, ({ id, url, args }) => {
    // The runner handles messages one at a time and waits for listeners,
    // so we do not return the promise, to avoid blocking HMR
    void evaluate(importModule, url, args).then(result => {
      hot.send(EVAL_RESULT_EVENT, { id, result });
    });
  });

  hot.send(READY_EVENT);
}

export async function evaluate(
  importModule: ImportModule,
  url: string,
  args: unknown[],
): Promise<EvaluatedModuleResult> {
  const storage = outputStorage();
  const output: Output = { stdout: [], stderr: [], open: true };

  try {
    const result = await storage.run(output, async () => {
      const module = await importModule(url);
      return module.default(...args);
    });

    return { success: true, result: serialize(result), ...collect(output) };
  } catch (error) {
    // Vite errors include terminal colors
    return { success: false, result: stripAnsiCodes(String(error)), ...collect(output) };
  }
}

// The runtime must have access to the project files and environment,
// which evaluations often need. Otherwise, such as in workerd, we
// evaluate in the Vite process instead.
function isSupportedRuntime(): boolean {
  const userAgent = globalThis.navigator?.userAgent;
  // Node before 21 has no navigator
  return userAgent === undefined || /^(Node\.js|Bun|Deno)\//.test(userAgent);
}

// The result is sent between processes, so we limit it to JSON values,
// same as evaluation in a forked process.
function serialize(result: unknown): EvaluatedModuleResult['result'] {
  if (result === undefined) return null;

  try {
    return JSON.parse(JSON.stringify(result));
  } catch {
    return String(result);
  }
}

function collect(output: Output): { stdout: string; stderr: string } {
  // Code started by the evaluation may still log, but the output is
  // already returned, so further logs go to the regular console.
  output.open = false;
  return { stdout: output.stdout.join(''), stderr: output.stderr.join('') };
}

const STORAGE_KEY = '__TIDEWAVE_EVAL_OUTPUT__';

// The app runtime can evaluate this module multiple times (on reload),
// so we keep the console patch global.
function outputStorage(): AsyncLocalStorage<Output> {
  const global = globalThis as { [STORAGE_KEY]?: AsyncLocalStorage<Output> };
  global[STORAGE_KEY] ??= patchConsole();
  return global[STORAGE_KEY];
}

// We capture console calls made within the evaluation async context,
// which excludes logs from other code running at the same time.
function patchConsole(): AsyncLocalStorage<Output> {
  const storage = new AsyncLocalStorage<Output>();

  const streams = [
    ['log', 'stdout'],
    ['info', 'stdout'],
    ['debug', 'stdout'],
    ['warn', 'stderr'],
    ['error', 'stderr'],
  ] as const;

  for (const [method, stream] of streams) {
    const original = console[method];

    console[method] = (...args: unknown[]): void => {
      const output = storage.getStore();

      if (output?.open) {
        output[stream].push(format(...args) + '\n');
      } else {
        original.apply(console, args);
      }
    };
  }

  return storage;
}
