/**
 * Initialize Tidewave logging for Next.js applications.
 * This function should be called from your `register` function in instrumentation.ts.
 *
 * @example
 * ```typescript
 * // instrumentation.ts
 * import { registerTidewaveLogger } from 'tidewave/next-js/logger'
 *
 * export function register() {
 *   registerTidewaveLogger()
 *   // other instrumentation...
 * }
 * ```
 */
export async function registerTidewaveLogger(): Promise<void> {
  const env = process.env['NODE_ENV'];
  const runtime = process.env['NEXT_RUNTIME'];

  if (env === 'development' && runtime === 'nodejs') {
    const { initializeLogging } = await import('../logger/instrumentation');
    initializeLogging();
  }
}
