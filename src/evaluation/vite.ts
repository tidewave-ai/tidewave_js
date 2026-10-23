// Evaluation of project code (project_eval) in Vite.
//
// The code should run in the same runtime as the app server code, so that
// it can access the app modules and their in-memory state. In Vite, the app
// server code runs through the module runner of the ssr environment. The
// runner fetches modules from the Vite server, which transforms them with
// all plugins, and it keeps its own module instances.
//
// We give the code to the runner as a module. Each evaluation gets a virtual
// module, such as /__tidewave_eval_0.ts, with the code wrapped in a default
// async function. Vite transforms it like app code, so TypeScript, aliases
// and imports of project files work, and the imports return the same module
// instances that the app uses.
//
// Where the ssr runner is, depends on the environment:
//
//   * In the Vite process (the Vite default, such as plain TanStack Start).
//     We import the evaluation module with that runner directly
//     (evaluateLocal).
//
//   * In a separate runtime (such as a Nitro worker). We cannot call that
//     runner, so we use the environment hot channel. The app server code
//     imports tidewave/tanstack, and the runner loads it, because we exclude
//     tidewave from ssr externals. That module listens for evaluation events
//     on import.meta.hot, imports the evaluation module with the runner, and
//     sends the result back. It sends a ready event first, so we know that
//     the runtime listens (evaluateRemote).
//
//   * Not available. The app has not handled a request yet, so the runtime
//     did not load our module, or the runtime is not supported (such as
//     workerd, which has no access to the project files and environment).
//     We evaluate with the runner of our own environment in the Vite
//     process, and add a note that the app state is not available
//     (evaluateLocal with FALLBACK_ENVIRONMENT).
//
// See runtime.ts for the part that runs in the app runtime.

import { randomUUID } from 'crypto';
import { basename, join } from 'path';
import type { DevEnvironment, RunnableDevEnvironment, UserConfig, ViteDevServer } from 'vite';
import type { EvaluatedModuleResult, EvaluationRequest } from '../core';
import {
  EVAL_EVENT,
  EVAL_RESULT_EVENT,
  READY_EVENT,
  evaluate,
  type EvalMessage,
  type EvalResultMessage,
} from './runtime';

// Evaluation modules look like files in the project root, so that Vite
// resolves their imports (including tsconfig paths) the same as app code.
const EVAL_FILE_REGEX = /\/__tidewave_eval_(\d+)\.ts$/;

// When the app server code runs outside of the Vite process and we
// cannot evaluate there, we evaluate in this environment instead.
const FALLBACK_ENVIRONMENT = 'tidewave';

const FALLBACK_NOTE =
  'The app server runtime is not available (the app has not handled a request yet, or the runtime is not supported, such as Cloudflare Workers). ' +
  'The code was evaluated in the Vite process, where app modules are separate instances from the ones used by the app.';

export interface ViteEvaluator {
  config(): UserConfig;
  resolveId(id: string, root: string | undefined): string | undefined;
  load(id: string): string | undefined;
  listen(server: ViteDevServer): void;
  evaluate(server: ViteDevServer, request: EvaluationRequest): Promise<EvaluatedModuleResult>;
}

export function createViteEvaluator(): ViteEvaluator {
  // Each evaluation gets a module from a reusable slot, so that the
  // module graph does not grow with each evaluation.
  const slots: (string | null)[] = [];
  const pending = new Map<string, (result: EvaluatedModuleResult) => void>();
  // Environments where the app runtime listens for evaluations
  const ready = new WeakSet<DevEnvironment>();

  function acquireSlot(code: string): number {
    const free = slots.indexOf(null);
    const slot = free === -1 ? slots.length : free;
    slots[slot] = code;
    return slot;
  }

  function releaseSlot(env: DevEnvironment, slot: number): void {
    slots[slot] = null;
    const module = env.moduleGraph.getModuleById(join(env.config.root, evalUrl(slot)));
    if (module) env.moduleGraph.invalidateModule(module);
  }

  async function evaluateLocal(
    env: RunnableDevEnvironment,
    url: string,
    request: EvaluationRequest,
  ): Promise<EvaluatedModuleResult> {
    // We get the runner before evaluation, so that its connection log is
    // not captured as evaluation output
    const { runner } = env;
    return evaluate(url => runner.import(url), url, request.args);
  }

  async function evaluateRemote(
    env: DevEnvironment,
    url: string,
    request: EvaluationRequest,
  ): Promise<EvaluatedModuleResult> {
    const id = randomUUID();
    const result = new Promise<EvaluatedModuleResult>(resolve => pending.set(id, resolve));

    try {
      const message: EvalMessage = { id, url, args: request.args };
      env.hot.send({ type: 'custom', event: EVAL_EVENT, data: message });
      return await result;
    } finally {
      pending.delete(id);
    }
  }

  return {
    config: () => ({
      environments: { [FALLBACK_ENVIRONMENT]: {} },
      // The app runtime must load our package through the module runner,
      // so that it can evaluate code (see tanstack.ts)
      ssr: { noExternal: ['tidewave'] },
    }),

    resolveId(id: string, root: string | undefined): string | undefined {
      if (root && EVAL_FILE_REGEX.test(id)) return join(root, basename(id));
    },

    load(id: string): string | undefined {
      const match = id.match(EVAL_FILE_REGEX);

      if (match) {
        const code = slots[Number(match[1])];
        // The runner may import a free slot, for example on full reload.
        // We keep the code on the first line, so that error lines match.
        return code == null
          ? 'export default null;'
          : `export default async function () {${code}\n}`;
      }
    },

    listen(server: ViteDevServer): void {
      const env = server.environments.ssr;

      env.hot.on(READY_EVENT, () => ready.add(env));

      env.hot.on(EVAL_RESULT_EVENT, ({ id, result }: EvalResultMessage) => {
        pending.get(id)?.(result);
      });
    },

    async evaluate(
      server: ViteDevServer,
      request: EvaluationRequest,
    ): Promise<EvaluatedModuleResult> {
      const { ssr } = server.environments;
      const slot = acquireSlot(request.code);
      const url = evalUrl(slot);

      if (isRunnable(ssr)) {
        return evaluateLocal(ssr, url, request).finally(() => releaseSlot(ssr, slot));
      }

      if (ready.has(ssr)) {
        return evaluateRemote(ssr, url, request).finally(() => releaseSlot(ssr, slot));
      }

      const env = server.environments[FALLBACK_ENVIRONMENT] as RunnableDevEnvironment;
      const result = await evaluateLocal(env, url, request).finally(() => releaseSlot(env, slot));
      return { ...result, note: FALLBACK_NOTE };
    },
  };
}

// Same as isRunnableDevEnvironment from Vite, but without importing Vite at
// runtime, and it works with multiple Vite copies
function isRunnable(env: DevEnvironment): env is RunnableDevEnvironment {
  return 'runner' in env;
}

function evalUrl(slot: number): string {
  return `/__tidewave_eval_${slot}.ts`;
}
