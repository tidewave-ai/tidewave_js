import { logs } from '@opentelemetry/api-logs';
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { defaultResource } from '@opentelemetry/resources';
import { logExporter } from './circular-buffer-exporter';

let isLoggingInitialized = false;

type ConsoleMethods = 'log' | 'info' | 'warn' | 'error' | 'debug';

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

function stripAnsiCodes(text: string): string {
  return text.replace(ANSI_REGEX, '');
}

function cleanLogMessage(text: string): string {
  return stripAnsiCodes(text).replace(/\n$/, '');
}

export function initializeLogging(): void {
  const isBrowser =
    typeof globalThis !== 'undefined' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeof (globalThis as any).window !== 'undefined';

  if (isLoggingInitialized || isBrowser) {
    return;
  }

  try {
    const resource = defaultResource();

    const loggerProvider = new LoggerProvider({
      resource,
      processors: [new SimpleLogRecordProcessor(logExporter)],
    });

    logs.setGlobalLoggerProvider(loggerProvider);
    patchConsole();
    patchProcessStreams();

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
        try {
          original(...args);
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

          logger.emit({
            severityText: severity,
            body,
            attributes: {
              'log.origin': 'console',
              'log.method': method,
            },
          });
        } catch {
          // Silently fail to avoid logging loops
        }
      };
    },
  );
}

function patchProcessStreams(): void {
  const logger = logs.getLogger('process', '1.0.0');

  if (process.stdout.write) {
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    process.stdout.write = function (chunk: any, ...args: any[]): boolean {
      const result = originalStdoutWrite(chunk, ...args);

      try {
        const message = typeof chunk === 'string' ? chunk : chunk?.toString();
        if (message && message.trim()) {
          const cleanMessage = cleanLogMessage(message);
          if (cleanMessage) {
            logger.emit({
              severityText: 'INFO',
              body: cleanMessage,
              attributes: {
                'log.origin': 'stdout',
              },
            });
          }
        }
      } catch {
        // Silently fail
      }

      return result;
    };
  }

  if (process.stderr.write) {
    const originalStderrWrite = process.stderr.write.bind(process.stderr);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    process.stderr.write = function (chunk: any, ...args: any[]): boolean {
      const result = originalStderrWrite(chunk, ...args);

      try {
        const message = typeof chunk === 'string' ? chunk : chunk?.toString();
        if (message && message.trim()) {
          const cleanMessage = cleanLogMessage(message);
          if (cleanMessage) {
            logger.emit({
              severityText: 'ERROR',
              body: cleanMessage,
              attributes: {
                'log.origin': 'stderr',
              },
            });
          }
        }
      } catch {
        // Silently fail
      }

      return result;
    };
  }
}
