import { logs } from '@opentelemetry/api-logs';
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { defaultResource } from '@opentelemetry/resources';
import { logExporter } from './circular-buffer-exporter';

let isLoggingInitialized = false;

type ConsoleMethods = 'log' | 'info' | 'warn' | 'error' | 'debug';

export function initializeLogging(): void {
  const isBrowser =
    typeof globalThis !== 'undefined' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeof (globalThis as any).window !== 'undefined';

  if (isLoggingInitialized || isBrowser) {
    console.log('[Tidewave] Logging already initialized or is browser, skipping');
    return;
  }

  console.log('[Tidewave] Initializing logging, PID:', process.pid);

  try {
    const resource = defaultResource();

    const loggerProvider = new LoggerProvider({
      resource,
      processors: [
        // Use SimpleLogRecordProcessor for immediate export in development
        // This ensures logs are available immediately without batching delay
        new SimpleLogRecordProcessor(logExporter),
      ],
    });

    logs.setGlobalLoggerProvider(loggerProvider);

    // Patch console methods to emit OTel logs
    patchConsole();

    isLoggingInitialized = true;
  } catch (error) {
    console.error('[Tidewave] Failed to initialize logging:', error);
  }
}

function patchConsole(): void {
  const logger = logs.getLogger('console', '1.0.0');

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
        original(...args);

        try {
          const body = args
            .map((arg: unknown) => {
              if (typeof arg === 'string') return arg;
              if (arg instanceof Error) {
                return arg.stack;
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
            .join(' ');

          logger.emit({
            severityText: severity,
            body,
            attributes: {
              'log.origin': 'console',
              'log.method': method,
            },
          });
        } catch (_err) {
          // Silently fail to avoid infinite loops
        }
      };
    },
  );
}
