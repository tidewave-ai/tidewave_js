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

    const evaluation: EvaluatedModuleResult = {
      success: false,
      result: null,
      stdout: '',
      stderr: '',
    };

    child.stdout?.on('data', data => {
      evaluation.stdout += data.toString();
    });

    child.stderr?.on('data', data => {
      evaluation.stderr += data.toString();
    });

    child.on('message', (msg: { type: 'result'; data: string; success: boolean }) => {
      if (msg.type === 'result') {
        const { data, success } = msg;
        evaluation.result = data;
        evaluation.success = success;
        // Acknowledge the result and tell the child to exit gracefully.
        child.send({ type: 'finish' });
      }
    });

    child.on('exit', code => {
      resolve({
        success: evaluation.success && code === 0,
        result: evaluation.result,
        stdout: evaluation.stdout.trim(),
        stderr: evaluation.stderr.trim(),
      } as EvaluatedModuleResult);
    });

    const { timeout } = request;

    const timeoutId = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({
        success: false,
        result: `Evaluation timed out after ${timeout} milliseconds`,
        stdout: evaluation.stdout,
        stderr: evaluation.stderr,
      } as EvaluatedModuleResult);
    }, timeout);

    child.on('exit', () => clearTimeout(timeoutId));

    child.send({ type: 'evaluate', request: request });
  });
}
