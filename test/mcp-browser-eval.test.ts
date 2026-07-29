import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { serveMcp } from '../src/mcp';
import {
  browserSessions,
  resetBrowserSessionsForTest,
  type ControlOutgoingMessage,
} from '../src/control/browser-sessions';

let mcpClient: Client | null = null;

afterEach(async () => {
  await mcpClient?.close();
  mcpClient = null;
  resetBrowserSessionsForTest();
});

describe('browser_eval MCP tool', () => {
  it('is only listed with browser tools enabled and requires an action', async () => {
    const withoutBrowserTools = await connectMcp({ includeBrowserTools: false });
    const toolsWithoutBrowserEval = await withoutBrowserTools.listTools();
    expect(toolsWithoutBrowserEval.tools.map(tool => tool.name)).not.toContain('browser_eval');
    await withoutBrowserTools.close();

    const client = await connectMcp({ includeBrowserTools: true });
    const tools = await client.listTools();
    const browserEval = tools.tools.find(tool => tool.name === 'browser_eval');

    expect(browserEval).toBeDefined();
    expect(browserEval?.description).toContain('You MUST use "help" action first');
    expect(browserEval?.inputSchema.required).toContain('action');
    expect(browserEval?.inputSchema.properties?.['action']).toMatchObject({
      type: 'string',
    });
    expect(browserEval?.inputSchema.properties?.['args']).toMatchObject({
      type: 'object',
      additionalProperties: true,
    });
  });

  it('errors when no sid is given and no browser is connected', async () => {
    const client = await connectMcp({
      includeBrowserTools: true,
      url: 'http://localhost:4000',
    });

    const result = await client.callTool({
      name: 'browser_eval',
      arguments: { action: 'help' },
    });

    expect(result).toMatchObject({
      isError: true,
      content: [
        {
          type: 'text',
          text:
            'No browser is connected to the Tidewave control page. ' +
            'Use the `open` command (or similar) to open http://localhost:4000/tidewave in the browser and try again.',
        },
      ],
    });
  });

  it('broadcasts when the sid is blank', async () => {
    const client = await connectMcp({
      includeBrowserTools: true,
      url: 'http://localhost:4000',
    });

    const result = await client.callTool({
      name: 'browser_eval',
      arguments: { action: 'eval', sid: '' },
    });

    expect(result).toMatchObject({
      isError: true,
      content: [
        {
          type: 'text',
          text:
            'No browser is connected to the Tidewave control page. ' +
            'Use the `open` command (or similar) to open http://localhost:4000/tidewave in the browser and try again.',
        },
      ],
    });
  });

  it('suggests starting a new session when a targeted sid is stale', async () => {
    const client = await connectMcp({ includeBrowserTools: true });

    const result = await client.callTool({
      name: 'browser_eval',
      arguments: { action: 'eval', sid: 'ghost#1' },
    });

    expect(result).toMatchObject({
      isError: true,
      content: [
        {
          type: 'text',
          text:
            'No connected browser owns sid "ghost#1". It may have disconnected - ' +
            'call browser_eval({"action": "new-session"}) to start a new one.',
        },
      ],
    });
  });

  it('routes eval action to the targeted browser session', async () => {
    const client = await connectMcp({ includeBrowserTools: true });
    const sent: ControlOutgoingMessage[] = [];
    const browserClient = browserSessions().createClient(message => sent.push(message));
    browserClient.receive(JSON.stringify({ type: 'hello', name: 'nice-cactus' }));

    const resultPromise = client.callTool({
      name: 'browser_eval',
      arguments: { action: 'eval', sid: 'nice-cactus#1', args: { code: '1+1' } },
    });
    const runTool = await waitForRunTool(sent);

    expect(runTool).toMatchObject({
      type: 'run_tool',
      name: 'browser_eval',
      sid: 'nice-cactus#1',
      input: { action: 'eval', sid: 'nice-cactus#1', args: { code: '1+1' } },
    });

    browserClient.receive(
      JSON.stringify({
        type: 'tool_reply',
        ref: runTool.ref,
        reply: { result: { content: [{ type: 'text', text: 'ok' }], isError: false } },
      }),
    );

    await expect(resultPromise).resolves.toMatchObject({
      isError: false,
      content: [{ type: 'text', text: 'ok' }],
    });
  });
});

async function connectMcp(options: {
  includeBrowserTools: boolean;
  url?: string;
}): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await serveMcp(serverTransport, options);
  await client.connect(clientTransport);
  mcpClient = client;
  return client;
}

async function waitForRunTool(
  sent: ControlOutgoingMessage[],
): Promise<Extract<ControlOutgoingMessage, { type: 'run_tool' }>> {
  for (let i = 0; i < 50; i += 1) {
    const message = sent.find(
      (entry): entry is Extract<ControlOutgoingMessage, { type: 'run_tool' }> =>
        entry.type === 'run_tool',
    );
    if (message) return message;
    await new Promise(resolve => setTimeout(resolve, 1));
  }

  throw new Error('Expected browser_eval run_tool message');
}
