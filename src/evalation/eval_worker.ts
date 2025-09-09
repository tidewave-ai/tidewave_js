import type { EvaluationRequest } from '../core';

process.on('message', async ({ code, args }: EvaluationRequest) => {
  if (!process.send) {
    console.error('Unable to establish communication channel with code-executor.');
    process.exit(1);
  }

  try {
    const context = {
      args,
      console,
      // safe globals
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      Buffer,
      JSON,
      Math,
      Date,
    };

    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    const fn = new AsyncFunction(
      ...Object.keys(context),
      `
        "use strict";
        return (async () => {
          ${code}
        })();
      `,
    );

    const result = await fn(...Object.values(context));

    process.send({
      type: 'result',
      success: true,
      data: result,
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
