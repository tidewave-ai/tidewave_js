import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { BrowserSessions } from '../../src/control/browser-sessions';
import { installControlWebSocket } from '../../src/control/websocket';

let server: Server | null = null;
let socket: WebSocket | null = null;

afterEach(async () => {
  vi.restoreAllMocks();

  socket?.close();
  socket = null;

  if (server) {
    await new Promise<void>(resolve => server?.close(() => resolve()));
    server = null;
  }
});

describe('control websocket', () => {
  it('upgrades /tidewave/ws and bridges control messages', async () => {
    const sessions = new BrowserSessions();
    server = createServer((_req, res) => {
      res.statusCode = 404;
      res.end();
    });

    installControlWebSocket(server, { allowedOrigins: ['//127.0.0.1'] }, sessions);
    const port = await listen(server);

    socket = new WebSocket(`ws://127.0.0.1:${port}/tidewave/ws`, {
      headers: { origin: `http://127.0.0.1:${port}` },
    });
    await waitForOpen(socket);

    socket.send(JSON.stringify({ type: 'hello', name: 'nice-cactus' }));
    await expect(nextJsonMessage(socket)).resolves.toEqual({
      type: 'hello_ok',
      name: 'nice-cactus',
    });

    const runPromise = sessions.run('nice-cactus#1', 'browser_eval', { code: '1+1' }, 1_000);
    const runTool = await nextJsonMessage(socket);

    expect(runTool).toMatchObject({
      type: 'run_tool',
      name: 'browser_eval',
      sid: 'nice-cactus#1',
      input: { code: '1+1' },
    });

    socket.send(
      JSON.stringify({
        type: 'tool_reply',
        ref: runTool.ref,
        reply: { result: { content: [{ type: 'text', text: 'ok' }], isError: false } },
      }),
    );

    await expect(runPromise).resolves.toEqual({
      ok: true,
      reply: { result: { content: [{ type: 'text', text: 'ok' }], isError: false } },
    });
  });

  it('terminates connections that stop answering pings', async () => {
    let heartbeat: (() => void) | undefined;
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation(callback => {
      heartbeat = callback as () => void;
      return undefined as unknown as ReturnType<typeof setInterval>;
    });

    const sessions = new BrowserSessions();
    server = createServer((_req, res) => {
      res.statusCode = 404;
      res.end();
    });

    installControlWebSocket(server, { allowedOrigins: ['//127.0.0.1'] }, sessions);
    const port = await listen(server);

    socket = new WebSocket(`ws://127.0.0.1:${port}/tidewave/ws`, {
      headers: { origin: `http://127.0.0.1:${port}` },
      autoPong: false,
    });
    await waitForOpen(socket);

    socket.send(JSON.stringify({ type: 'hello', name: 'quiet-fjord' }));
    await expect(nextJsonMessage(socket)).resolves.toEqual({
      type: 'hello_ok',
      name: 'quiet-fjord',
    });

    const pingPromise = new Promise<void>((resolve, reject) => {
      socket?.once('ping', () => resolve());
      socket?.once('error', reject);
    });
    const closePromise = new Promise<void>(resolve => {
      socket?.once('close', () => resolve());
    });

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 15_000);
    heartbeat?.();
    await pingPromise;
    heartbeat?.();
    await closePromise;

    expect([...sessions.listClients()]).toEqual([]);

    // Bun does not complete server.close(callback) after a server-side
    // terminate on an upgraded socket, so stop and unref it directly.
    server.close();
    server.unref();
    server = null;
    socket = null;
  });
});

function listen(server: Server): Promise<number> {
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'object' && address) resolve(address.port);
    });
  });
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
}

function nextJsonMessage(ws: WebSocket): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    ws.once('message', data => {
      try {
        resolve(JSON.parse(String(data)));
      } catch (error) {
        reject(error);
      }
    });
    ws.once('error', reject);
  });
}
