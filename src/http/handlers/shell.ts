import { spawn } from 'child_process';
import { type Request, type Response, type NextFn, methodNotAllowed } from '../index';
import { platform } from 'os';

export async function handleShell(req: Request, res: Response, next: NextFn): Promise<void> {
  try {
    if (req.method !== 'POST') {
      methodNotAllowed(res);
      return;
    }

    const command = req.body?.command as string;

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

      res.end();
    });

    req.on('close', () => {
      if (!child.killed) {
        child.kill();
      }
    });
  } catch (e) {
    console.error(`[Tidewave] Failed to execute shell command: ${e}`);

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

export function getShellCommand(command: string): { cmd: string; args: string[] } {
  const isWindows = platform() === 'win32';

  if (isWindows) {
    const comspec = process.env.COMSPEC || 'cmd.exe';
    return { cmd: comspec, args: ['/s', '/c', command] };
  } else {
    return { cmd: 'sh', args: ['-c', command] };
  }
}
