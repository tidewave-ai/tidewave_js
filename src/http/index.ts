import type { ServerResponse } from 'http';
import type { Connect } from 'vite';

export type Request = Connect.IncomingMessage;
export type Response = ServerResponse<Connect.IncomingMessage>;
export type NextFn = Connect.NextFunction;

export function methodNotAllowed(res: Response): void {
  res.statusCode = 405;
  res.setHeader('Allow', 'POST');
  res.end();
  return;
}

export function decodeBody(req: Request): Promise<Record<string, unknown>> {
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
