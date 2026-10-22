import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { createServer, DevEnvironment, type InlineConfig, type ViteDevServer } from 'vite';
import { createViteEvaluator, type ViteEvaluator } from '../src/evaluation/vite';

function startServer(evaluator: ViteEvaluator, config: InlineConfig = {}): Promise<ViteDevServer> {
  return createServer({
    root: path.join(__dirname, 'fixtures/vite-app'),
    configFile: false,
    logLevel: 'silent',
    server: { middlewareMode: true, hmr: false },
    plugins: [
      {
        name: 'test-evaluator',
        config: () => evaluator.config(),
        resolveId(id) {
          return evaluator.resolveId(id, this.environment.config.root);
        },
        load: id => evaluator.load(id),
        configureServer: server => evaluator.listen(server),
      },
    ],
    ...config,
  });
}

describe('Vite evaluation', () => {
  const evaluator = createViteEvaluator();
  let server: ViteDevServer;

  const run = (code: string, args: unknown[] = []) =>
    evaluator.evaluate(server, { code, args, timeout: 5_000 });

  beforeAll(async () => {
    server = await startServer(evaluator);
  });

  afterAll(async () => {
    await server.close();
  });

  it('shares module state between evaluations', async () => {
    const code = `
      const { items } = await import('./src/store');
      items.push(arguments[0]);
      return items;
    `;

    expect((await run(code, ['second'])).result).toEqual(['first', 'second']);
    expect((await run(code, ['third'])).result).toEqual(['first', 'second', 'third']);
  });

  it('supports TypeScript syntax', async () => {
    const result = await run('const x: number = 41; return x + 1;');
    expect(result).toMatchObject({ success: true, result: 42 });
  });

  it('reuses evaluation modules', async () => {
    const evalModules = () =>
      [...server.environments.ssr.moduleGraph.idToModuleMap.keys()].filter(id =>
        id.includes('__tidewave_eval_'),
      );

    await run('return 1;');
    const count = evalModules().length;
    await run('return 2;');

    expect(evalModules()).toHaveLength(count);
  });

  it('captures console output', async () => {
    const result = await run(
      `
      console.log('hello', { a: 1 });
      console.error('oops');
      await Promise.resolve();
      console.info('after await');
      return arguments[0] + arguments[1];
    `,
      [1, 2],
    );

    expect(result).toEqual({
      success: true,
      result: 3,
      stdout: 'hello { a: 1 }\nafter await\n',
      stderr: 'oops\n',
    });
  });

  it('keeps output of concurrent evaluations separate', async () => {
    const code = `
      for (let i = 0; i < 3; i++) {
        console.log(arguments[0]);
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    `;

    const [a, b] = await Promise.all([run(code, ['a']), run(code, ['b'])]);

    expect(a.stdout).toBe('a\na\na\n');
    expect(b.stdout).toBe('b\nb\nb\n');
  });

  it('returns errors without terminal colors', async () => {
    const result = await run("throw new Error('\\x1b[31mboom\\x1b[0m');");
    expect(result).toMatchObject({ success: false, result: 'Error: boom' });
  });

  it('returns null for undefined results', async () => {
    const result = await run('const x = 1;');
    expect(result).toMatchObject({ success: true, result: null });
  });

  it('times out', async () => {
    const result = await evaluator.evaluate(server, {
      code: 'await new Promise(resolve => setTimeout(resolve, 1_000));',
      args: [],
      timeout: 10,
    });

    expect(result).toMatchObject({
      success: false,
      result: 'Evaluation timed out after 10 milliseconds',
    });
  });
});

describe('Vite evaluation when the app runs in a separate runtime', () => {
  const evaluator = createViteEvaluator();
  let server: ViteDevServer;

  beforeAll(async () => {
    // Similar to Nitro or Cloudflare, the SSR environment has no runner in
    // the Vite process, because a plain DevEnvironment has no runner (unlike
    // RunnableDevEnvironment).
    //
    // In a real app, the remote runner loads tidewave/tanstack when the app
    // server code imports it (on the first request), and then it sends the
    // ready event. Here, no runner runs the SSR code at all, so the ready
    // event never comes, and evaluation uses the fallback. This is the same
    // as before the first request, or in workerd, where the module does not
    // listen.
    server = await startServer(evaluator, {
      environments: {
        ssr: {
          dev: {
            createEnvironment: (name, config) => new DevEnvironment(name, config, { hot: false }),
          },
        },
      },
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it('evaluates in the Vite process', async () => {
    const result = await evaluator.evaluate(server, {
      code: "const { items } = await import('./src/store'); return items;",
      args: [],
      timeout: 5_000,
    });

    expect(result).toMatchObject({ success: true, result: ['first'] });
    expect(result.note).toContain('evaluated in the Vite process');
  });
});
