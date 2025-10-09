import { logs } from '@opentelemetry/api-logs';
import { LoggerProvider, BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { defaultResource } from '@opentelemetry/resources';
import { logExporter } from './circular-buffer-exporter';

let isLoggingInitialized = false;

type ConsoleMethods = 'log' | 'info' | 'warn' | 'error' | 'debug';

export function initializeLogging(): void {
  // Check if we're in a browser environment
  const isBrowser =
    typeof globalThis !== 'undefined' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeof (globalThis as any).window !== 'undefined';

  if (isLoggingInitialized || isBrowser) {
    return; // Only initialize on server, once
  }

  try {
    // Create resource with default attributes
    const resource = defaultResource();

    // Create logger provider with our circular buffer exporter
    const loggerProvider = new LoggerProvider({
      resource,
      processors: [
        new BatchLogRecordProcessor(logExporter, {
          maxQueueSize: 100,
          maxExportBatchSize: 10,
          scheduledDelayMillis: 1000,
        }),
      ],
    });

    // Register globally
    logs.setGlobalLoggerProvider(loggerProvider);

    // Patch console methods to emit OTel logs
    patchConsole();

    isLoggingInitialized = true;
    console.log('[Tidewave] Logging initialized with circular buffer');
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
        // Call original first
        original(...args);

        // Emit OTel log
        try {
          const body = args
            .map((arg: unknown) => {
              if (typeof arg === 'string') return arg;
              if (arg instanceof Error) {
                return `${arg.name}: ${arg.message}\n${arg.stack}`;
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
