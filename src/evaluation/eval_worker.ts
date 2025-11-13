import type { EvaluationRequest } from '../core';

type WorkerMessage = { type: 'evaluate'; request: EvaluationRequest } | { type: 'finish' };

process.on('message', async (message: WorkerMessage) => {
  if (!process.send) {
    console.error('[Tidewave] Unable to establish communication channel with code-executor.');
    process.exit(1);
  }

  if (message.type === 'evaluate') {
    const { code, args } = message.request;

    try {
      const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
      const fn = new AsyncFunction(code);
      const result = await fn(...args);

      process.send({
        type: 'result',
        success: true,
        data: (result ?? null) && result,
      });
    } catch (error) {
      process.send({
        type: 'result',
        success: false,
        data: new String(error),
      });
    }
  } else if (message.type === 'finish') {
    // Note that process.send is async [1], so we wait for the parent
    // to receive the result and then tell us to exit.
    //
    // [1]: https://github.com/nodejs/node/issues/6767
    process.exit(0);
  }
});
