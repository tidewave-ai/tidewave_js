import { circularBuffer } from './circular-buffer';

type ConsoleMethods = 'log' | 'info' | 'warn' | 'error' | 'debug';

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

function stripAnsiCodes(text: string): string {
  return text.replace(ANSI_REGEX, '');
}

/**
 * Patch console methods to write directly to the circular buffer.
 * This is called automatically when this module is imported.
 */
function patchConsole(): void {
  const isBrowser =
    typeof globalThis !== 'undefined' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeof (globalThis as any).window !== 'undefined';

  if (isBrowser) {
    return;
  }

  // Check if already patched
  // @ts-expect-error - Flag to track if console has been patched
  if (globalThis.__TIDEWAVE_CONSOLE_PATCHED__) {
    return;
  }

  const severityMap: Record<ConsoleMethods, string> = {
    log: 'INFO',
    info: 'INFO',
    warn: 'WARN',
    error: 'ERROR',
    debug: 'DEBUG',
  };

  (Object.entries(severityMap) as [ConsoleMethods, string][]).forEach(
    ([method, severity]): void => {
      const original = console[method].bind(console);

      console[method] = (...args: unknown[]): void => {
        // Try to write to buffer, but don't break console if it fails
        try {
          const body = args
            .map((arg: unknown) => {
              if (typeof arg === 'string') return arg;
              if (arg instanceof Error) {
                return String(arg.stack);
              }
              if (typeof arg === 'object') {
                try {
                  return JSON.stringify(arg);
                } catch {
                  return String(arg);
                }
              }
              return String(arg);
            })
            .map(stripAnsiCodes)
            .join(' ');

          const isAllWhitespace = body.match(/^\s+$/);

          if (!isAllWhitespace) {
            circularBuffer.addLog({
              timestamp: new Date().toISOString(),
              severityText: severity,
              body,
              attributes: {
                'log.origin': 'console',
                'log.method': method,
              },
            });
          }
        } catch {
          // Silently fail to avoid breaking console
        }

        // Always call original console method
        original(...args);
      };
    },
  );

  // @ts-expect-error - Flag to track console patching
  globalThis.__TIDEWAVE_CONSOLE_PATCHED__ = true;
}

// Patch console at the top level (executed on module import)
patchConsole();

// Export processors for users to add to their own OpenTelemetry setup
export { TidewaveSpanProcessor } from './tidewave-span-processor';
export { TidewaveLogRecordProcessor } from './tidewave-log-record-processor';
