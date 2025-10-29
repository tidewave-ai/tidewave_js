export interface StoredLogRecord {
  timestamp: string;
  severityText: string;
  body: string;
  attributes?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  resource?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface LogFilterOptions {
  tail?: number;
  grep?: string;
  level?: string;
  since?: string;
}

/**
 * Standalone circular buffer for storing logs.
 * This is a global singleton that is not tied to any logger or exporter.
 * Both console.log patches and OpenTelemetry processors write directly to this buffer.
 */
export class CircularBuffer {
  private buffer: (StoredLogRecord | undefined)[];
  private maxSize: number;
  private writeIndex: number = 0;
  private count: number = 0;

  constructor(maxSize: number = 1024) {
    this.buffer = new Array(maxSize);
    this.maxSize = maxSize;
  }

  /**
   * Add a log entry to the circular buffer.
   * This method is called directly by console patching and OTel processors.
   */
  addLog(log: StoredLogRecord): void {
    this.buffer[this.writeIndex] = log;
    this.writeIndex = (this.writeIndex + 1) % this.maxSize;
    this.count = Math.min(this.count + 1, this.maxSize);
  }

  /**
   * Get logs from the buffer with optional filtering.
   */
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

  /**
   * Get all logs in chronological order.
   */
  private getAllLogs(): StoredLogRecord[] {
    if (this.count < this.maxSize) {
      return this.buffer.slice(0, this.count).filter(Boolean) as StoredLogRecord[];
    }

    // Buffer is full, return in correct order
    return [...this.buffer.slice(this.writeIndex), ...this.buffer.slice(0, this.writeIndex)].filter(
      Boolean,
    ) as StoredLogRecord[];
  }

  /**
   * Get statistics about the buffer usage.
   */
  getStats(): { totalLogs: number; bufferSize: number; bufferUsage: string } {
    return {
      totalLogs: this.count,
      bufferSize: this.maxSize,
      bufferUsage: Math.min((this.count / this.maxSize) * 100, 100).toFixed(1) + '%',
    };
  }

  /**
   * Clear the buffer.
   */
  clear(): void {
    this.buffer = new Array(this.maxSize);
    this.writeIndex = 0;
    this.count = 0;
  }
}

// Singleton instance with fixed buffer size of 1024 entries
// Use runtime-global variable to ensure the same instance is shared across module contexts
// This is necessary because Next.js API routes may run in different module contexts
declare global {
  var __tidewaveCircularBuffer: CircularBuffer | undefined;
}

if (!globalThis.__tidewaveCircularBuffer) {
  globalThis.__tidewaveCircularBuffer = new CircularBuffer(1024);
}

export const circularBuffer = globalThis.__tidewaveCircularBuffer;
