import type { EvaluationRequest } from '../core';

process.on('message', async ({ code, args }: EvaluationRequest) => {
  if (!process.send) {
    console.error('[Tidewave] Unable to establish communication channel with code-executor.');
    process.exit(1);
  }

  try {
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    const fn = new AsyncFunction(code);
    const result = await fn(...args);

    process.send({
      type: 'result',
      success: true,
      data: (result || null) && result,
    });
  } catch (error) {
    process.send({
      type: 'result',
      success: false,
      data: new String(error),
    });
  }

  process.exit(0);
});
