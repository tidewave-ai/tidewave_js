import type { IncomingMessage, ServerResponse } from 'node:http';

export interface TidewaveRequest extends IncomingMessage {
  body?: Record<string, unknown>;
}

export type TidewaveResponse = ServerResponse<IncomingMessage>;
export type TidewaveNext = (err?: unknown) => void;
export type TidewaveHandler = (
  req: TidewaveRequest,
  res: TidewaveResponse,
  next: TidewaveNext,
) => Promise<void>;

export interface TidewaveMiddlewareServer {
  use(route: string, handler: unknown): void;
}
