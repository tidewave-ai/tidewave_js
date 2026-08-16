import http from 'node:http';
import path from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { serveMcp, type ServeMcpOptions } from '../src/mcp';

const canvasHtml = '<!doctype html>\n<html>canvas</html>';

let server: http.Server;
let clientUrl: string;
let mcpClient: Client | null = null;
let tmpDirPath: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/tc/data/canvas.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ html: canvasHtml }));
    } else {
      res.writeHead(404);
      res.end('not found');
    }
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  clientUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

beforeEach(async () => {
  tmpDirPath = await mkdtemp(path.join(tmpdir(), 'tidewave-js-design-canvas-'));
});

afterEach(async () => {
  await mcpClient?.close();
  mcpClient = null;
  await rm(tmpDirPath, { recursive: true, force: true });
});

describe('create_design_canvas MCP tool', () => {
  it('is only listed with browser tools enabled', async () => {
    const withoutBrowserTools = await connectMcp({ includeBrowserTools: false });
    const toolsWithoutCanvas = await withoutBrowserTools.listTools();
    expect(toolsWithoutCanvas.tools.map(tool => tool.name)).not.toContain('create_design_canvas');
    await withoutBrowserTools.close();

    const client = await connectMcp({ includeBrowserTools: true });
    const tools = await client.listTools();
    expect(tools.tools.map(tool => tool.name)).toContain('create_design_canvas');
  });

  it('creates the canvas file, including parent directories', async () => {
    const client = await connectMcp({ includeBrowserTools: true, clientUrl });
    const canvasPath = path.join(tmpDirPath, 'designs/canvas.html');

    const result = await client.callTool({
      name: 'create_design_canvas',
      arguments: { path: canvasPath },
    });

    expect(result).toMatchObject({
      isError: false,
      content: [
        {
          type: 'text',
          text: `Design canvas created at: <path>${canvasPath}</path>. Read the file for usage instructions.`,
        },
      ],
    });
    expect(await readFile(canvasPath, 'utf8')).toBe(canvasHtml);
  });

  it('returns error for a relative path', async () => {
    const client = await connectMcp({ includeBrowserTools: true, clientUrl });

    const result = await client.callTool({
      name: 'create_design_canvas',
      arguments: { path: 'canvas.html' },
    });

    expect(result).toMatchObject({ isError: true });
    expect(toolText(result)).toContain('must be an absolute path');
  });

  it('returns error for a path without .html extension', async () => {
    const client = await connectMcp({ includeBrowserTools: true, clientUrl });
    const canvasPath = path.join(tmpDirPath, 'canvas.txt');

    const result = await client.callTool({
      name: 'create_design_canvas',
      arguments: { path: canvasPath },
    });

    expect(result).toMatchObject({ isError: true });
    expect(toolText(result)).toContain('must be an absolute path with the .html file extension');
  });

  it('returns error when the file already exists', async () => {
    const client = await connectMcp({ includeBrowserTools: true, clientUrl });
    const canvasPath = path.join(tmpDirPath, 'canvas.html');
    await writeFile(canvasPath, 'existing');

    const result = await client.callTool({
      name: 'create_design_canvas',
      arguments: { path: canvasPath },
    });

    expect(result).toMatchObject({ isError: true });
    expect(toolText(result)).toContain('the file already exists');
    expect(await readFile(canvasPath, 'utf8')).toBe('existing');
  });

  it('returns error when the template cannot be fetched', async () => {
    const client = await connectMcp({
      includeBrowserTools: true,
      clientUrl: `${clientUrl}/unknown`,
    });
    const canvasPath = path.join(tmpDirPath, 'canvas.html');

    const result = await client.callTool({
      name: 'create_design_canvas',
      arguments: { path: canvasPath },
    });

    expect(result).toMatchObject({ isError: true });
    expect(toolText(result)).toContain('Failed to fetch the design canvas template');
    expect(existsSync(canvasPath)).toBe(false);
  });
});

async function connectMcp(options: ServeMcpOptions): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await serveMcp(serverTransport, options);
  await client.connect(clientTransport);
  mcpClient = client;
  return client;
}

function toolText(result: unknown): string {
  const { content } = result as { content: Array<{ type: string; text: string }> };
  return content.map(entry => entry.text).join('\n');
}
