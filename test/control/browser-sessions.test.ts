import { describe, expect, it } from 'vitest';
import { BrowserSessions, type ControlOutgoingMessage } from '../../src/control/browser-sessions';

function createClient(sessions: BrowserSessions) {
  const sent: ControlOutgoingMessage[] = [];
  const client = sessions.createClient(message => sent.push(message));
  return { client, sent };
}

describe('BrowserSessions', () => {
  it('registers a client after hello and rejects duplicate names', () => {
    const sessions = new BrowserSessions();
    const first = createClient(sessions);
    const second = createClient(sessions);

    first.client.receive(JSON.stringify({ type: 'hello', name: 'nice-cactus' }));
    second.client.receive(JSON.stringify({ type: 'hello', name: 'nice-cactus' }));

    expect(first.sent).toEqual([{ type: 'hello_ok', name: 'nice-cactus' }]);
    expect(second.sent).toEqual([{ type: 'hello_error', reason: 'name_taken' }]);
    expect(sessions.listClients()).toEqual([['nice-cactus', first.client]]);
  });

  it('routes a run request to the client owning the sid', async () => {
    const sessions = new BrowserSessions();
    const { client, sent } = createClient(sessions);
    client.receive(JSON.stringify({ type: 'hello', name: 'nice-cactus' }));

    const resultPromise = sessions.run('nice-cactus#1', 'browser_eval', { code: '1+1' }, 1_000);
    const runTool = sent.at(-1);

    expect(runTool).toMatchObject({
      type: 'run_tool',
      name: 'browser_eval',
      sid: 'nice-cactus#1',
      input: { code: '1+1' },
    });

    client.receive(
      JSON.stringify({
        type: 'tool_reply',
        ref: runTool?.type === 'run_tool' ? runTool.ref : -1,
        result: { content: [{ type: 'text', text: 'ok' }], isError: false },
      }),
    );

    await expect(resultPromise).resolves.toEqual({
      ok: true,
      result: { content: [{ type: 'text', text: 'ok' }], isError: false },
    });
  });

  it('reports invalid and unknown sids', async () => {
    const sessions = new BrowserSessions();

    await expect(sessions.run('missing-hash', 'browser_eval', {}, 1_000)).resolves.toEqual({
      ok: false,
      reason: 'invalid_sid',
    });
    await expect(sessions.run('ghost#1', 'browser_eval', {}, 1_000)).resolves.toEqual({
      ok: false,
      reason: 'unknown_client',
    });
  });

  it('reports direct disconnects while a request is pending', async () => {
    const sessions = new BrowserSessions();
    const { client } = createClient(sessions);
    client.receive(JSON.stringify({ type: 'hello', name: 'dying-comet' }));

    const resultPromise = sessions.run('dying-comet#1', 'browser_eval', {}, 1_000);
    client.disconnect();

    await expect(resultPromise).resolves.toEqual({ ok: false, reason: 'disconnected' });
  });

  it('broadcasts to all clients and returns the first reply', async () => {
    const sessions = new BrowserSessions();
    const first = createClient(sessions);
    const second = createClient(sessions);
    first.client.receive(JSON.stringify({ type: 'hello', name: 'first-robin' }));
    second.client.receive(JSON.stringify({ type: 'hello', name: 'second-robin' }));

    const resultPromise = sessions.broadcastRun('browser_eval', {}, 1_000);
    const firstRunTool = first.sent.at(-1);
    const secondRunTool = second.sent.at(-1);

    expect(firstRunTool).toMatchObject({ type: 'run_tool', sid: null, name: 'browser_eval' });
    expect(secondRunTool).toMatchObject({ type: 'run_tool', sid: null, name: 'browser_eval' });

    second.client.receive(
      JSON.stringify({
        type: 'tool_reply',
        ref: secondRunTool?.type === 'run_tool' ? secondRunTool.ref : -1,
        result: { content: [{ type: 'text', text: 'from second' }], isError: false },
      }),
    );

    await expect(resultPromise).resolves.toEqual({
      ok: true,
      result: { content: [{ type: 'text', text: 'from second' }], isError: false },
    });
    expect(first.client.pendingRefs()).toEqual([]);
    expect(second.client.pendingRefs()).toEqual([]);
  });

  it('times out when a connected client does not reply', async () => {
    const sessions = new BrowserSessions();
    const { client } = createClient(sessions);
    client.receive(JSON.stringify({ type: 'hello', name: 'quiet-fjord' }));

    await expect(sessions.run('quiet-fjord#1', 'browser_eval', {}, 5)).resolves.toEqual({
      ok: false,
      reason: 'timeout',
    });
  });
});
