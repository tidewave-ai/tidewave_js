import type { ViteDevServer, Plugin, Connect } from 'vite';
import { serveMcp } from './mcp';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { ServerResponse } from 'http';
import { spawn } from 'child_process';
import { platform } from 'os';

const endpoint = '/tidewave' as const;

export interface TidewaveConfig {
  allowRemoteAccess?: boolean;
  allowedOrigins?: string[];
}

export function tidewave(config: TidewaveConfig = {}): Plugin {
  return {
    name: 'vite-plugin-tidewave',
    configureServer: server => tidewaveServer(server, config),
  };
}

function tidewaveServer(server: ViteDevServer, config: TidewaveConfig): void {
  const middleware = (req: Request, res: Response, next: NextFn): void => {
    if (!checkRemoteIp(req, res, config)) return;
    if (!checkOrigin(req, res, server, config)) return;
    next();
  };

  server.middlewares.use('*', middleware);
  server.middlewares.use(`${endpoint}/mcp`, handleMcp);
  server.middlewares.use(`${endpoint}/shell`, handleShell);
}

type Request = Connect.IncomingMessage;
type Response = ServerResponse<Connect.IncomingMessage>;
type NextFn = Connect.NextFunction;

function checkRemoteIp(req: Request, res: Response, config: TidewaveConfig): boolean {
  const { remoteAddress } = req.socket;
  if (isLocalIp(remoteAddress)) return true;
  if (config.allowRemoteAccess) return true;

  const message =
    'For security reasons, Tidewave does not accept remote connections by default.\n\nIf you really want to allow remote connections, configure the Tidewave with the `allowRemoteAccess: true` option.';
  console.warn(message);
  res.statusCode = 403;
  res.end(message);
  return false;
}

function isLocalIp(ip?: string): boolean {
  if (!ip) return false;

  // IPv4 localhost
  if (ip.startsWith('127.0.0.') || ip === '127.0.0.1') return true;

  // IPv6 localhost
  if (ip === '::1') return true;

  // IPv4 mapped IPv6 localhost (::ffff:127.0.0.1)
  if (ip === '::ffff:127.0.0.1') return true;

  return false;
}

function checkOrigin(
  req: Request,
  res: Response,
  server: ViteDevServer,
  config: TidewaveConfig,
): boolean {
  const { origin } = req.headers;

  // No origin header means non-browser request (e.g. Claude Code, Cursor)
  if (!origin) return true;

  const allowedOrigins = config.allowedOrigins || getDefaultAllowedOrigins(server);
  const originUrl = parseUrl(origin);

  if (!originUrl) {
    const message = `For security reasons, Tidewave only accepts requests from allowed origins.\n\nInvalid origin: ${origin}`;
    console.warn(message);
    res.statusCode = 403;
    res.end(message);
    return false;
  }

  const isAllowed = allowedOrigins.some(allowed => isOriginAllowed(originUrl, parseUrl(allowed)));

  if (!isAllowed) {
    const message = `For security reasons, Tidewave only accepts requests from the same origin your web app is running on.\n\nIf you really want to allow remote connections, configure the Tidewave with the \`allowedOrigins: [${JSON.stringify(origin)}]\` option.`;
    console.warn(message);
    res.statusCode = 403;
    res.end(message);
    return false;
  }

  return true;
}

function getDefaultAllowedOrigins(server: ViteDevServer): string[] {
  const { config } = server;
  const host = config.server.host || 'localhost';
  const port = config.server.port || 5173;
  return [`http://${host}:${port}`, `https://${host}:${port}`];
}

function parseUrl(url: string): { scheme?: string; host: string; port?: number } | null {
  try {
    const parsed = new URL(url.startsWith('//') ? 'http:' + url : url);
    return {
      scheme: parsed.protocol?.slice(0, -1),
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port) : undefined,
    };
  } catch {
    return null;
  }
}

function isOriginAllowed(
  origin: ReturnType<typeof parseUrl>,
  allowed: ReturnType<typeof parseUrl>,
): boolean {
  if (!origin || !allowed) return false;

  // Check scheme (if specified in allowed)
  if (allowed.scheme && origin.scheme !== allowed.scheme) return false;

  // Check port (if specified in allowed)
  if (allowed.port && origin.port !== allowed.port) return false;

  // Check host with wildcard support
  if (allowed.host.startsWith('*.')) {
    const allowedDomain = allowed.host.slice(2);
    return origin.host === allowedDomain || origin.host.endsWith('.' + allowedDomain);
  }

  return origin.host === allowed.host;
}

async function handleMcp(req: Request, res: Response, next: NextFn): Promise<void> {
  try {
    if (req.method !== 'POST') {
      methodNotAllowed(res);
      return;
    }

    console.log(`Received ${req.method} message`);

    // stateless mode, no session managament
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    const body = await decodeBody(req);
    await serveMcp(transport);
    await transport.handleRequest(req, res, body);
  } catch (e) {
    console.error(`Failed to serve MCP with ${e}`);

    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          jsonrpc: 2.0,
          id: null,
          error: {
            code: -32603,
            message: 'Internal server error',
            data: e instanceof Error ? e.message : String(e),
          },
        }),
      );
    }

    next(e);
  }
}

function methodNotAllowed(res: Response): void {
  res.statusCode = 405;
  res.setHeader('Allow', 'POST');
  res.end();
  return;
}

function decodeBody(req: Request): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body: string = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        console.error(`Failed to parse body: ${e}`);
        reject(e);
      }
    });
  });
}

async function handleShell(req: Request, res: Response, next: NextFn): Promise<void> {
  try {
    if (req.method !== 'POST') {
      methodNotAllowed(res);
      return;
    }

    const body = await decodeBody(req);
    const command = body.command as string;

    if (!command) {
      res.statusCode = 400;
      res.end('Missing command in request body');
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/octet-stream');

    const { cmd, args } = getShellCommand(command);
    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      cwd: process.cwd(),
    });

    let outputEnded = false;
    let errorEnded = false;

    const checkEnd = (): void => {
      if (outputEnded && errorEnded && !res.destroyed) res.end();
    };

    child.stdout.on('data', (data: Buffer) => {
      if (!res.destroyed) {
        const chunk = Buffer.concat([
          Buffer.from([0]),
          Buffer.from([
            (data.length >>> 24) & 0xff,
            (data.length >>> 16) & 0xff,
            (data.length >>> 8) & 0xff,
            data.length & 0xff,
          ]),
          data,
        ]);
        res.write(chunk);
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      if (!res.destroyed) {
        const chunk = Buffer.concat([
          Buffer.from([0]),
          Buffer.from([
            (data.length >>> 24) & 0xff,
            (data.length >>> 16) & 0xff,
            (data.length >>> 8) & 0xff,
            data.length & 0xff,
          ]),
          data,
        ]);
        res.write(chunk);
      }
    });

    child.stdout.on('end', () => {
      outputEnded = true;
      checkEnd();
    });

    child.stderr.on('end', () => {
      errorEnded = true;
      checkEnd();
    });

    child.on('exit', code => {
      if (!res.destroyed) {
        const statusData = JSON.stringify({ status: code || 0 });
        const statusBuffer = Buffer.from(statusData);
        const chunk = Buffer.concat([
          Buffer.from([1]),
          Buffer.from([
            (statusBuffer.length >>> 24) & 0xff,
            (statusBuffer.length >>> 16) & 0xff,
            (statusBuffer.length >>> 8) & 0xff,
            statusBuffer.length & 0xff,
          ]),
          statusBuffer,
        ]);
        res.write(chunk);
      }

      outputEnded = true;
      errorEnded = true;
      checkEnd();
    });

    req.on('close', () => {
      if (!child.killed) {
        child.kill();
      }
    });
  } catch (e) {
    console.error(`Failed to execute shell command: ${e}`);

    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: 'Internal server error',
          message: e instanceof Error ? e.message : String(e),
        }),
      );
    }

    next(e);
  }
}

function getShellCommand(command: string): { cmd: string; args: string[] } {
  const isWindows = platform() === 'win32';

  if (isWindows) {
    const comspec = process.env.COMSPEC || 'cmd.exe';
    return { cmd: comspec, args: ['/s', '/c', command] };
  } else {
    return { cmd: 'sh', args: ['-c', command] };
  }
}
