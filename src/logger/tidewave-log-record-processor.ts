import type { LogRecordProcessor, SdkLogRecord } from '@opentelemetry/sdk-logs';
import type { Context } from '@opentelemetry/api';
import { circularBuffer } from './circular-buffer';

/**
 * Custom LogRecordProcessor that captures OpenTelemetry logger logs
 * and writes them directly to the circular buffer.
 *
 * This is opt-in for users who want to capture actual logger logs
 * (not console.log, which is handled separately by console patching).
 */
export class TidewaveLogRecordProcessor implements LogRecordProcessor {
  /**
   * Called when a log record is emitted.
   */
  onEmit(logRecord: SdkLogRecord, _context?: Context): void {
    try {
      const body = String(logRecord.body || '');

      circularBuffer.addLog({
        timestamp: new Date(
          logRecord.hrTime[0] * 1000 + logRecord.hrTime[1] / 1_000_000,
        ).toISOString(),
        severityText: logRecord.severityText || 'INFO',
        body,
        attributes: logRecord.attributes,
        resource: logRecord.resource?.attributes,
      });
    } catch (_error) {
      // Silently fail to avoid breaking logging
    }
  }

  async forceFlush(): Promise<void> {
    // No-op: we process log records synchronously
  }

  async shutdown(): Promise<void> {
    // No-op: no resources to clean up
  }
}
