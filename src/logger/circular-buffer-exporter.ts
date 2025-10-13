import type { LogRecordExporter, ReadableLogRecord } from '@opentelemetry/sdk-logs';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';

export interface StoredLogRecord {
  timestamp: string;
  severityText: string;
  body: string;
  attributes?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  resource?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  traceId?: string;
  spanId?: string;
}

export interface LogFilterOptions {
  tail?: number;
  grep?: string;
  level?: string;
  since?: string;
}

export class CircularBufferLogExporter implements LogRecordExporter {
  private buffer: (StoredLogRecord | undefined)[];
  private maxSize: number;
  private writeIndex: number = 0;
  private count: number = 0;
  private readonly internalLogPrefix = '[tidewave';

  constructor(maxSize: number = 1024) {
    this.buffer = new Array(maxSize);
    this.maxSize = maxSize;
  }

  export(logs: ReadableLogRecord[], resultCallback: (result: ExportResult) => void): void {
    try {
      for (const log of logs) {
        // Filter out Tidewave's own internal logs
        const body = String(log.body || '');
        if (body.toLowerCase().startsWith(this.internalLogPrefix)) {
          continue;
        }

        const storedLog: StoredLogRecord = {
          timestamp: new Date(log.hrTime[0] * 1000 + log.hrTime[1] / 1_000_000).toISOString(),
          severityText: log.severityText || 'INFO',
          body,
          attributes: log.attributes,
          resource: log.resource?.attributes,
          traceId: log.spanContext?.traceId,
          spanId: log.spanContext?.spanId,
        };

        this.buffer[this.writeIndex] = storedLog;
        this.writeIndex = (this.writeIndex + 1) % this.maxSize;
        this.count = Math.min(this.count + 1, this.maxSize);
      }

      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (error) {
      resultCallback({
        code: ExportResultCode.FAILED,
        error: error as Error,
      });
    }
  }

  async shutdown(): Promise<void> {
    this.buffer = [];
  }

  getLogs(options?: LogFilterOptions): StoredLogRecord[] {
    // Get logs in chronological order
    let logs = this.getAllLogs();

    // Apply filters
    if (options?.level) {
      const level = options.level.toUpperCase();
      logs = logs.filter(log => log.severityText === level);
    }

    if (options?.since) {
      const sinceDate = new Date(options.since);
      logs = logs.filter(log => new Date(log.timestamp) >= sinceDate);
    }

    if (options?.grep) {
      const regex = new RegExp(options.grep, 'i');
      logs = logs.filter(log => regex.test(log.body) || regex.test(JSON.stringify(log.attributes)));
    }

    // Apply tail limit
    if (options?.tail) {
      logs = logs.slice(-options.tail);
    }

    return logs;
  }

  private getAllLogs(): StoredLogRecord[] {
    if (this.count < this.maxSize) {
      return this.buffer.slice(0, this.count).filter(Boolean) as StoredLogRecord[];
    }

    // Buffer is full, return in correct order
    return [...this.buffer.slice(this.writeIndex), ...this.buffer.slice(0, this.writeIndex)].filter(
      Boolean,
    ) as StoredLogRecord[];
  }

  getStats(): { totalLogs: number; bufferSize: number; bufferUsage: string } {
    return {
      totalLogs: this.count,
      bufferSize: this.maxSize,
      bufferUsage: Math.min((this.count / this.maxSize) * 100, 100).toFixed(1) + '%',
    };
  }
}

// Singleton instance with fixed buffer size of 1024 entries
export const logExporter = new CircularBufferLogExporter(1024);
