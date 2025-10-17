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
