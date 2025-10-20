/**
 * Auto mode: Initialize both console logging and OpenTelemetry tracing.
 * Use this if you DON'T have custom OpenTelemetry instrumentation.
 */
export async function registerTidewaveLogger(): Promise<void> {
  const env = process.env['NODE_ENV'];
  const runtime = process.env['NEXT_RUNTIME'];

  if (env !== 'development' || runtime !== 'nodejs')
    throw new Error(
      '[Tidewave] tidewave is designed to only work on development environment and `nodejs` runtime',
    );

  const { initializeLogging } = await import('../logger/instrumentation');
  initializeLogging();
}

/**
 * Manual mode: Initialize only console logging (no OpenTelemetry provider).
 * Use this if you HAVE custom OpenTelemetry instrumentation and will
 * add TidewaveProcessor to your own tracer provider.
 */
export async function registerConsoleLogging(): Promise<void> {
  const env = process.env['NODE_ENV'];
  const runtime = process.env['NEXT_RUNTIME'];

  if (env !== 'development' || runtime !== 'nodejs')
    throw new Error(
      '[Tidewave] tidewave is designed to only work on development environment and `nodejs` runtime',
    );

  const { initializeConsoleLogging } = await import('../logger/instrumentation');
  initializeConsoleLogging();
}

// Export TidewaveProcessor for manual OpenTelemetry integration
export { TidewaveProcessor } from '../logger/tidewave-processor';
