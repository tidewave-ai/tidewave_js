import { describe, it, expect } from 'vitest';
import { isTidewaveRoute } from '../src/next-js';

describe('isTidewaveRoute', () => {
  it('should return true on correct routes paths', () => {
    let result: boolean;
    result = isTidewaveRoute('/tidewave/mcp');
    expect(result).toBe(true);

    result = isTidewaveRoute('/tidewave/shell');
    expect(result).toBe(true);
  });
});
