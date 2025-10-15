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
  // Only initialize in development and Node.js runtime
  // OpenTelemetry SDK is not compatible with Edge runtime
  const env = process.env['NODE_ENV'];
  const runtime = process.env['NEXT_RUNTIME'];

  // Explicit runtime check - only initialize in Node.js runtime
  if (env === 'development' && runtime === 'nodejs') {
    // Dynamic import to avoid bundling OpenTelemetry in edge/instrumentation context
    const { initializeLogging } = await import('../logger/instrumentation');
    initializeLogging();
  }
}
