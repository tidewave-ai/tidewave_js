import { describe, it, expect, beforeEach } from 'vitest';
import { initializeLogging } from '../src/logger/instrumentation';
import { logExporter } from '../src/logger/circular-buffer-exporter';

describe('Logger with SimpleLogRecordProcessor', () => {
  beforeEach(() => {
    // Clear the log buffer before each test
    logExporter.getLogs({ tail: 0 });
  });

  it('should capture logs immediately without batching delay', async () => {
    // Initialize logging
    initializeLogging();

    // Get initial stats
    const initialStats = logExporter.getStats();
    const initialCount = initialStats.totalLogs;

    // Emit test logs
    console.log('[TEST] Test log message 1');
    console.warn('[TEST] Test warning message');
    console.error('[TEST] Test error message');

    // Query immediately - with SimpleLogRecordProcessor, logs should be available right away
    const logs = logExporter.getLogs({ tail: 10 });

    // Filter to only test logs
    const testLogs = logs.filter(log => log.body.includes('[TEST]'));

    // Verify logs were captured immediately
    expect(testLogs.length).toBeGreaterThanOrEqual(3);

    // Verify log levels
    const logMessages = testLogs.map(log => ({
      level: log.severityText,
      message: log.body,
    }));

    expect(logMessages).toContainEqual(
      expect.objectContaining({
        level: 'INFO',
        message: expect.stringContaining('Test log message 1'),
      }),
    );

    expect(logMessages).toContainEqual(
      expect.objectContaining({
        level: 'WARN',
        message: expect.stringContaining('Test warning message'),
      }),
    );

    expect(logMessages).toContainEqual(
      expect.objectContaining({
        level: 'ERROR',
        message: expect.stringContaining('Test error message'),
      }),
    );

    // Verify stats updated
    const finalStats = logExporter.getStats();
    expect(finalStats.totalLogs).toBeGreaterThan(initialCount);
  });

  it('should filter out internal tidewave logs', () => {
    initializeLogging();

    // Emit internal logs that should be filtered
    console.log('[tidewave] Internal log 1');
    console.log('[Tidewave] Internal log 2');
    console.log('[TIDEWAVE] Internal log 3');

    // Emit application log that should be captured
    console.log('[APP] Application log');

    const logs = logExporter.getLogs({ tail: 10 });

    // Verify internal logs are filtered out
    const tidewaveLogs = logs.filter(log => log.body.toLowerCase().includes('[tidewave'));
    expect(tidewaveLogs.length).toBe(0);

    // Verify application log is captured
    const appLogs = logs.filter(log => log.body.includes('[APP]'));
    expect(appLogs.length).toBeGreaterThanOrEqual(1);
  });

  it('should support log filtering by level', () => {
    initializeLogging();

    console.log('[FILTER] Info message');
    console.warn('[FILTER] Warning message');
    console.error('[FILTER] Error message');

    // Get only error logs
    const errorLogs = logExporter.getLogs({ level: 'ERROR', tail: 10 });
    const filterErrorLogs = errorLogs.filter(log => log.body.includes('[FILTER]'));

    expect(filterErrorLogs.length).toBeGreaterThanOrEqual(1);
    filterErrorLogs.forEach(log => {
      expect(log.severityText).toBe('ERROR');
    });
  });

  it('should support log filtering by grep pattern', () => {
    initializeLogging();

    console.log('[GREP] Message with keyword FINDME');
    console.log('[GREP] Another message');
    console.log('[GREP] Yet another FINDME message');

    const logs = logExporter.getLogs({ grep: 'FINDME', tail: 10 });

    expect(logs.length).toBeGreaterThanOrEqual(2);
    logs.forEach(log => {
      expect(log.body).toMatch(/FINDME/i);
    });
  });

  it('should capture error objects with stack traces', () => {
    initializeLogging();

    const testError = new Error('Test error with stack');
    console.error('[ERROR_TEST]', testError);

    const logs = logExporter.getLogs({ grep: 'ERROR_TEST', tail: 10 });

    expect(logs.length).toBeGreaterThanOrEqual(1);
    const errorLog = logs[0];
    expect(errorLog).toBeDefined();

    // Verify error details are captured
    expect(errorLog?.body).toContain('Error: Test error with stack');
    expect(errorLog?.body).toContain('at'); // Stack trace line
  });

  it('should capture JSON objects', () => {
    initializeLogging();

    const testObject = { key: 'value', nested: { foo: 'bar' } };
    console.log('[JSON_TEST]', testObject);

    const logs = logExporter.getLogs({ grep: 'JSON_TEST', tail: 10 });

    expect(logs.length).toBeGreaterThanOrEqual(1);
    const jsonLog = logs[0];
    expect(jsonLog).toBeDefined();

    // Verify object is serialized
    expect(jsonLog?.body).toContain('key');
    expect(jsonLog?.body).toContain('value');
  });

  it('should track buffer usage stats', () => {
    initializeLogging();

    // Generate some logs
    for (let i = 0; i < 10; i++) {
      console.log(`[STATS] Test log ${i}`);
    }

    const stats = logExporter.getStats();

    expect(stats.totalLogs).toBeGreaterThanOrEqual(10);
    expect(stats.bufferSize).toBe(1024);
    expect(stats.bufferUsage).toMatch(/\d+\.\d+%/);
  });
});
