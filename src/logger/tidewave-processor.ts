import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { Span, Context } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';

/**
 * Custom SpanProcessor that converts OpenTelemetry spans to logs.
 * This is used to capture Next.js HTTP request/response spans and
 * make them available via the get_logs tool.
 */
export class TidewaveProcessor implements SpanProcessor {
  private logger = logs.getLogger('tidewave-processor', '1.0.0');

  /**
   * Called when a span is started. We don't need to do anything here.
   */
  onStart(_span: Span, _parentContext: Context): void {
    // No-op: we only care about completed spans
  }

  /**
   * Called when a span ends. This is where we convert the span to a log entry.
   */
  onEnd(span: ReadableSpan): void {
    try {
      const spanType = span.attributes['next.span_type'];
      const httpMethod = span.attributes['http.method'];

      // Only log certain span types to avoid noise
      const relevantSpanTypes = [
        'BaseServer.handleRequest',
        'AppRender.getBodyResult',
        'AppRouteRouteHandlers.runHandler',
      ];

      if (!spanType || !relevantSpanTypes.includes(spanType as string)) {
        return;
      }

      // Extract relevant information
      const route = span.attributes['next.route'] || span.attributes['http.route'];
      const httpUrl = span.attributes['http.url'];
      const httpTarget = span.attributes['http.target'];
      const httpStatusCode = span.attributes['http.status_code'];

      // Filter out /tidewave paths
      const path = route || httpTarget || httpUrl || 'unknown';
      if (typeof path === 'string' && path.startsWith('/tidewave')) {
        return;
      }

      const durationMs = this.calculateDuration(span);

      let message = '';
      let severity = 'INFO';

      if (spanType === 'BaseServer.handleRequest') {
        const method = httpMethod || 'UNKNOWN';
        const status = httpStatusCode || 'unknown';
        message = `${method} ${path} ${status} ${durationMs.toFixed(2)}ms`;

        if (typeof httpStatusCode === 'number') {
          if (httpStatusCode >= 500) severity = 'ERROR';
          else if (httpStatusCode >= 400) severity = 'WARN';
        }
      } else if (spanType === 'AppRender.getBodyResult') {
        message = `Rendered route: ${route || 'unknown'} (${durationMs.toFixed(2)}ms)`;
      } else if (spanType === 'AppRouteRouteHandlers.runHandler') {
        message = `API route: ${route || 'unknown'} (${durationMs.toFixed(2)}ms)`;
      }

      // Emit log with trace context embedded in attributes
      this.logger.emit({
        severityText: severity,
        body: message,
        attributes: {
          'log.origin': 'opentelemetry-span',
          'span.name': span.name,
          'span.kind': span.kind,
          'span.type': spanType,
          'http.method': httpMethod,
          'http.route': route,
          'http.status_code': httpStatusCode,
          'duration.ms': durationMs,
        },
      });
    } catch (_error) {
      // Silently fail to avoid breaking tracing
      // console.error('[TidewaveProcessor] Error processing span:', error);
    }
  }

  /**
   * Calculate span duration in milliseconds from high-resolution time
   */
  private calculateDuration(span: ReadableSpan): number {
    const startTimeMs = span.startTime[0] * 1000 + span.startTime[1] / 1_000_000;
    const endTimeMs = span.endTime[0] * 1000 + span.endTime[1] / 1_000_000;
    return endTimeMs - startTimeMs;
  }

  async forceFlush(): Promise<void> {
    // No-op: we process spans synchronously
  }

  async shutdown(): Promise<void> {
    // No-op: no resources to clean up
  }
}
