import { logs } from '@opentelemetry/api-logs';
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { defaultResource } from '@opentelemetry/resources';
import { logExporter } from './circular-buffer-exporter';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { TidewaveProcessor } from './tidewave-processor';

let isConsoleLoggingInitialized = false;
let isTracingInitialized = false;

type ConsoleMethods = 'log' | 'info' | 'warn' | 'error' | 'debug';

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

function stripAnsiCodes(text: string): string {
  return text.replace(ANSI_REGEX, '');
}

/**
 * Initialize console patching only. Safe to call alongside custom OpenTelemetry.
 * This captures console.log/info/warn/error and sends them to the log exporter.
 */
export function initializeConsoleLogging(): void {
  const isBrowser =
    typeof globalThis !== 'undefined' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeof (globalThis as any).window !== 'undefined';

  if (isConsoleLoggingInitialized || isBrowser) {
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

    isConsoleLoggingInitialized = true;
  } catch (error) {
    console.error('[Tidewave] Failed to initialize console logging:', error);
  }
}

/**
 * Initialize OpenTelemetry tracer provider with TidewaveProcessor.
 * WARNING: This will register a global tracer provider. If you already have
 * custom OpenTelemetry setup, DON'T call this. Instead, add TidewaveProcessor
 * to your own tracer provider.
 */
function initializeTracing(): void {
  if (isTracingInitialized) {
    return;
  }

  try {
    const resource = defaultResource();
    const tracerProvider = new NodeTracerProvider({
      resource,
      spanProcessors: [new TidewaveProcessor()],
    });

    // Register the tracer provider globally so Next.js can use it
    tracerProvider.register();

    isTracingInitialized = true;
  } catch (error) {
    console.error('[Tidewave] Failed to initialize tracing:', error);
  }
}

/**
 * Initialize both console logging and OpenTelemetry tracing (auto mode).
 * Use this if you don't have custom OpenTelemetry instrumentation.
 */
export function initializeLogging(): void {
  initializeConsoleLogging();
  initializeTracing();

  // @ts-expect-error - Flag to track logging initialization for MCP server
  globalThis.__TIDEWAVE_LOGGING_INITIALIZED__ = true;
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
        // Try to emit to logger, but don't break console if it fails
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

          logger.emit({
            severityText: severity,
            body,
            attributes: {
              'log.origin': 'console',
              'log.method': method,
            },
          });
        } catch {
          // Silently fail logger errors to avoid breaking console
        }

        // Always call original console method
        original(...args);
      };
    },
  );
}
