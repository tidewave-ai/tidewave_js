import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import type { TidewaveConfig } from '../core';
import { ENDPOINT } from '../http/constants';
import { validateOrigin, validateRemoteIp } from '../http/security';
import type { TidewaveRequest } from '../http/types';
import { browserSessions, type BrowserSessions } from './browser-sessions';

const HEARTBEAT_INTERVAL = 15_000;

type UpgradeCapableServer = {
  on(
    event: 'upgrade',
    listener: (req: IncomingMessage, socket: Socket, head: Buffer) => void,
  ): void;
  once(event: 'close', listener: () => void): void;
  off(
    event: 'upgrade',
    listener: (req: IncomingMessage, socket: Socket, head: Buffer) => void,
  ): void;
};

export function installControlWebSocket(
  httpServer: UpgradeCapableServer | null | undefined,
  config: TidewaveConfig,
  sessions: BrowserSessions = browserSessions(),
): (() => void) | undefined {
  if (!httpServer) return undefined;

  const wss = new WebSocketServer({ noServer: true });
  let closed = false;

  const upgradeHandler = (req: IncomingMessage, socket: Socket, head: Buffer): void => {
    if (requestPath(req) !== `${ENDPOINT}/ws`) return;

    const request = req as TidewaveRequest;
    const remoteIpResult = validateRemoteIp(request, config);
    if (!remoteIpResult.ok) {
      rejectUpgrade(socket, remoteIpResult.statusCode, remoteIpResult.message);
      return;
    }

    const originResult = validateOrigin(request, config);
    if (!originResult.ok) {
      rejectUpgrade(socket, originResult.statusCode, originResult.message);
      return;
    }

    wss.handleUpgrade(req, socket, head, ws => {
      const client = sessions.createClient(message => {
        try {
          if (ws.readyState !== WebSocket.OPEN) return false;
          ws.send(JSON.stringify(message));
          return true;
        } catch {
          return false;
        }
      });

      ws.on('message', (data, isBinary) => {
        if (!isBinary) client.receive(data.toString('utf8'));
      });

      let alive = true;
      const heartbeat = setInterval(() => {
        if (!alive) {
          ws.terminate();
          return;
        }

        alive = false;
        ws.ping();
      }, HEARTBEAT_INTERVAL);

      const disconnect = (): void => {
        clearInterval(heartbeat);
        client.disconnect();
      };

      ws.on('pong', () => {
        alive = true;
      });
      ws.on('close', disconnect);
      ws.on('error', disconnect);
      wss.emit('connection', ws, req);
    });
  };

  const closeHandler = (): void => {
    if (closed) return;
    closed = true;
    httpServer.off('upgrade', upgradeHandler);
    for (const client of wss.clients) {
      client.terminate();
    }
    wss.close();
  };

  httpServer.on('upgrade', upgradeHandler);
  httpServer.once('close', closeHandler);

  return closeHandler;
}

function requestPath(req: IncomingMessage): string {
  try {
    return new URL(req.url || '/', 'http://localhost').pathname;
  } catch {
    return '';
  }
}

function rejectUpgrade(socket: Socket, statusCode: number, message: string): void {
  console.warn(message);
  const statusText = statusCode === 403 ? 'Forbidden' : 'Error';
  socket.write(
    `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
      'Connection: close\r\n' +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      `Content-Length: ${Buffer.byteLength(message)}\r\n` +
      '\r\n' +
      message,
  );
  socket.destroy();
}
