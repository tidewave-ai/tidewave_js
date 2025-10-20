import { logs } from '@opentelemetry/api-logs';
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { defaultResource } from '@opentelemetry/resources';
import { logExporter } from './circular-buffer-exporter';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SpanToLogProcessor } from './span-to-log-processor';

let isLoggingInitialized = false;
let isTracingInitialized = false;

type ConsoleMethods = 'log' | 'info' | 'warn' | 'error' | 'debug';

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

function stripAnsiCodes(text: string): string {
  return text.replace(ANSI_REGEX, '');
}

function cleanLogMessage(text: string): string {
  return stripAnsiCodes(text)
    .replace(/\n$/, '')
    .replaceAll(/tidewave/i, '');
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
    initializeTracing(resource);

    isLoggingInitialized = true;
    // @ts-expect-error - Flag to track logging initialization for MCP server
    globalThis.__TIDEWAVE_LOGGING_INITIALIZED__ = true;
  } catch (error) {
    console.error('[Tidewave] Failed to initialize logging:', error);
  }
}

function initializeTracing(resource: ReturnType<typeof defaultResource>): void {
  if (isTracingInitialized) {
    return;
  }

  try {
    // Initialize a tracer provider with our custom SpanToLogProcessor
    const tracerProvider = new NodeTracerProvider({
      resource,
      spanProcessors: [new SpanToLogProcessor()],
    });

    // Register the tracer provider globally so Next.js can use it
    tracerProvider.register();

    isTracingInitialized = true;
  } catch (error) {
    console.error('[Tidewave] Failed to initialize tracing:', error);
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
          // Emit to logger first to avoid potential circular issues
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
            .map(cleanLogMessage)
            .join(' ');

          logger.emit({
            severityText: severity,
            body,
            attributes: {
              'log.origin': 'console',
              'log.method': method,
            },
          });

          // Call original after logging to avoid recursion
          original(...args);
        } catch {
          // Silently fail to avoid logging loops
        }
      };
    },
  );
}
