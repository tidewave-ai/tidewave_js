import { describe, expect, it } from 'vitest';
import { getRequestLocalPort } from '../src/next-js/handler';
import type { Request } from '../src/http';

describe('Tidewave Next.js Handler', () => {
  it('should use the request socket port in config responses', () => {
    const req = {
      headers: {
        host: 'localhost:3000',
        origin: 'http://localhost:9999',
      },
      socket: {
        remoteAddress: '127.0.0.1',
        localPort: 1234,
        address: () => ({ address: '127.0.0.1', family: 'IPv4', port: 4321 }),
      },
    };

    expect(getRequestLocalPort(req as unknown as Request)).toBe(4321);
  });
});
