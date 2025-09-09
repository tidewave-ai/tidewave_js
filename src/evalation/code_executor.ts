import { spawn } from 'child_process';
import { join } from 'path';
import type { EvaluatedModuleResult, EvaluationRequest } from '../core';

export async function executeIsolated(request: EvaluationRequest): Promise<EvaluatedModuleResult> {
  return new Promise(resolve => {
    const workerPath = join(__dirname, 'eval_worker.ts');

    const child = spawn('node', [workerPath], {
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'sandbox' },
    });

    const evaluation: EvaluatedModuleResult = {
      success: false,
      result: '',
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
      }
    });

    child.on('exit', code => {
      resolve({
        success: evaluation.success && code === 0,
        result: evaluation.result || `Process exited with code ${code}`,
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

    child.send(request);
  });
}
