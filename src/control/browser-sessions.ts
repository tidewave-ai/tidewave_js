import { CallToolResultSchema, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export interface ControlToolReply {
  result: CallToolResult;
}

export type BrowserSessionErrorReason =
  | 'invalid_sid'
  | 'unknown_client'
  | 'no_clients'
  | 'timeout'
  | 'disconnected';

export type BrowserSessionResult =
  | { ok: true; reply: ControlToolReply }
  | { ok: false; reason: BrowserSessionErrorReason };

export type ControlOutgoingMessage =
  | { type: 'hello_ok'; name: string }
  | { type: 'hello_error'; reason: 'name_taken' }
  | { type: 'run_tool'; ref: number; name: string; sid: string | null; input: unknown };

type PendingRequest = {
  resolveReply(reply: ControlToolReply): void;
  resolveDisconnect(): void;
};

const controlIncomingMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    name: z.string(),
  }),
  z.object({
    type: z.literal('tool_reply'),
    ref: z.number(),
    reply: z.object({
      result: CallToolResultSchema,
    }),
  }),
]);

/**
 * A connected browser.
 */
export class BrowserClient {
  name: string | null = null;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(
    private readonly sessions: BrowserSessions,
    private readonly sendMessage: (message: ControlOutgoingMessage) => void,
  ) {}

  receive(text: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }

    const result = controlIncomingMessageSchema.safeParse(parsed);
    if (!result.success) return;

    const message = result.data;
    if (message.type === 'hello') {
      const registration = this.sessions.registerClient(message.name, this);
      if (registration === 'ok') {
        this.push({ type: 'hello_ok', name: message.name });
      } else {
        this.push({ type: 'hello_error', reason: 'name_taken' });
      }
      return;
    }

    this.reply(message.ref, message.reply);
  }

  disconnect(): void {
    this.sessions.unregisterClient(this);
    for (const [ref, pending] of this.pending) {
      this.pending.delete(ref);
      pending.resolveDisconnect();
    }
  }

  pendingRefs(): number[] {
    return [...this.pending.keys()];
  }

  addPending(ref: number, pending: PendingRequest): void {
    this.pending.set(ref, pending);
  }

  deletePending(ref: number): void {
    this.pending.delete(ref);
  }

  runTool(ref: number, sid: string | null, name: string, input: unknown): boolean {
    return this.push({ type: 'run_tool', ref, name, sid, input });
  }

  private reply(ref: number, reply: ControlToolReply): void {
    const pending = this.pending.get(ref);
    if (!pending) return;

    this.pending.delete(ref);
    pending.resolveReply(reply);
  }

  private push(message: ControlOutgoingMessage): boolean {
    try {
      this.sendMessage(message);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * All connected browsers.
 *
 * This class is a global singleton initialized in browserSessions().
 */
export class BrowserSessions {
  private readonly clients = new Map<string, BrowserClient>();
  private nextRef = 1;

  createClient(sendMessage: (message: ControlOutgoingMessage) => void): BrowserClient {
    return new BrowserClient(this, sendMessage);
  }

  registerClient(name: string, client: BrowserClient): 'ok' | 'name_taken' {
    const current = this.clients.get(name);
    if (current && current !== client) return 'name_taken';

    if (client.name && client.name !== name && this.clients.get(client.name) === client) {
      this.clients.delete(client.name);
    }

    client.name = name;
    this.clients.set(name, client);
    return 'ok';
  }

  unregisterClient(client: BrowserClient): void {
    if (client.name && this.clients.get(client.name) === client) {
      this.clients.delete(client.name);
    }
    client.name = null;
  }

  listClients(): IterableIterator<BrowserClient> {
    return this.clients.values();
  }

  run(
    sid: string,
    name: string,
    input: unknown,
    timeout = Infinity,
  ): Promise<BrowserSessionResult> {
    const clientName = parseSid(sid);
    if (!clientName) return Promise.resolve({ ok: false, reason: 'invalid_sid' });

    const client = this.clients.get(clientName);
    if (!client) return Promise.resolve({ ok: false, reason: 'unknown_client' });

    return new Promise(resolve => {
      let settled = false;
      const ref = this.allocateRef();

      const settle = (result: BrowserSessionResult): void => {
        if (settled) return;
        settled = true;
        clearRequestTimeout(timer);
        client.deletePending(ref);
        resolve(result);
      };

      const timer = setRequestTimeout(() => {
        settle({ ok: false, reason: 'timeout' });
      }, timeout);

      client.addPending(ref, {
        resolveReply: reply => settle({ ok: true, reply }),
        resolveDisconnect: () => settle({ ok: false, reason: 'disconnected' }),
      });

      if (!client.runTool(ref, sid, name, input)) {
        settle({ ok: false, reason: 'disconnected' });
      }
    });
  }

  broadcastRun(name: string, input: unknown, timeout: number): Promise<BrowserSessionResult> {
    const clients = [...this.listClients()];
    if (clients.length === 0) return Promise.resolve({ ok: false, reason: 'no_clients' });

    return new Promise(resolve => {
      let settled = false;
      const refs = clients.map(client => ({ client, ref: this.allocateRef() }));

      const cleanup = (): void => {
        for (const { client, ref } of refs) {
          client.deletePending(ref);
        }
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ ok: false, reason: 'timeout' });
      }, timeout);

      for (const { client, ref } of refs) {
        client.addPending(ref, {
          resolveReply: result => {
            if (settled) return;
            settled = true;
            clearRequestTimeout(timer);
            cleanup();
            resolve({ ok: true, reply: result });
          },
          resolveDisconnect: () => {
            client.deletePending(ref);
          },
        });

        if (!client.runTool(ref, null, name, input)) {
          client.deletePending(ref);
        }
      }
    });
  }

  private allocateRef(): number {
    const ref = this.nextRef;
    this.nextRef = this.nextRef >= Number.MAX_SAFE_INTEGER ? 1 : this.nextRef + 1;
    return ref;
  }
}

declare global {
  var __TIDEWAVE_BROWSER_SESSIONS__: BrowserSessions | undefined;
}

export function browserSessions(): BrowserSessions {
  globalThis.__TIDEWAVE_BROWSER_SESSIONS__ ||= new BrowserSessions();
  return globalThis.__TIDEWAVE_BROWSER_SESSIONS__;
}

export function resetBrowserSessionsForTest(): void {
  globalThis.__TIDEWAVE_BROWSER_SESSIONS__ = new BrowserSessions();
}

function setRequestTimeout(
  callback: () => void,
  timeout: number,
): ReturnType<typeof setTimeout> | null {
  if (!Number.isFinite(timeout)) return null;
  return setTimeout(callback, timeout);
}

function clearRequestTimeout(timer: ReturnType<typeof setTimeout> | null): void {
  if (timer) clearTimeout(timer);
}

function parseSid(sid: string): string | null {
  const parts = sid.split('#');
  if (parts.length !== 2) return null;
  const [name, suffix] = parts;
  if (!name || !suffix) return null;
  return name;
}
