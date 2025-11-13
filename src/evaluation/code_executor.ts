import { fork } from 'child_process';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import type { EvaluatedModuleResult, EvaluationRequest } from '../core';

export async function executeIsolated(request: EvaluationRequest): Promise<EvaluatedModuleResult> {
  return new Promise(resolve => {
    // Resolve worker path from package - works even when this code is bundled
    const require = createRequire(import.meta.url);
    const packageRoot = dirname(require.resolve('tidewave/package.json'));
    const workerPath = join(packageRoot, 'dist/evaluation/eval_worker.js');

    const child = fork(workerPath, { silent: true });

    let result: { success: boolean; result: string | null } | null = null;
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    child.stdout?.on('data', data => {
      stdoutChunks.push(data.toString());
    });

    child.stderr?.on('data', data => {
      stderrChunks.push(data.toString());
    });

    child.on('message', (msg: { type: 'result'; data: string; success: boolean }) => {
      if (msg.type === 'result') {
        const { data, success } = msg;
        result = { success, result: data };
        // Acknowledge the result and tell the child to exit gracefully.
        child.send({ type: 'finish' });
      }
    });

    child.on('exit', code => {
      if (result === null) {
        result = {
          success: false,
          result: `Evaluation process terminated unexpectedly with code ${code}`,
        };
      }

      resolve({
        success: result.success,
        result: result.result,
        stdout: stdoutChunks.join(''),
        stderr: stderrChunks.join(''),
      } as EvaluatedModuleResult);
    });

    const { timeout } = request;

    const timeoutId = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({
        success: false,
        result: `Evaluation timed out after ${timeout} milliseconds`,
        stdout: stdoutChunks.join(''),
        stderr: stderrChunks.join(''),
      } as EvaluatedModuleResult);
    }, timeout);

    child.on('exit', () => clearTimeout(timeoutId));

    child.send({ type: 'evaluate', request: request });
  });
}
