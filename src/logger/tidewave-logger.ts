import { appendFile, readFile } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

export interface StoredLogRecord {
  timestamp: string;
  severityText: string;
  body: string;
  attributes?: Record<string, unknown>;
}

export interface LogFilterOptions {
  tail?: number;
  grep?: string;
  level?: string;
  since?: string;
}

/**
 * Tidewave log store.
 *
 * Storing logs in memory can be problematic, because some frameworks
 * can use multiple execution contexts with isolated module loading
 * and globals. In such circumstances, if we import the logger and
 * write to it within the app, it may be a different logger instance
 * from the one that the MCP server uses the get the logs. To avoid
 * issues we persist logs in a NDJSON file, so it works across
 * execution contexts.
 */
export class TidewaveLogger {
  private logFilePath: string;

  constructor() {
    const cwd = process.cwd();
    const digest = crypto.createHash('md5').update(cwd).digest('hex').slice(0, 16);
    const tempDir = os.tmpdir();
    this.logFilePath = path.join(tempDir, `${digest}.tidewave.ndjson`);
  }

  /**
   * Store a log entry.
   */
  async addLog(log: StoredLogRecord): Promise<void> {
    const line = JSON.stringify(log) + '\n';

    try {
      await appendFile(this.logFilePath, line, 'utf8');
    } catch (error) {
      console.log('[Tidewave] failed to write to log file, error:', error);
    }
  }

  /**
   * Get stored logs.
   */
  async getLogs(options?: LogFilterOptions): Promise<StoredLogRecord[]> {
    let logs = await this.getAllLogs();

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

    if (options?.tail) {
      logs = logs.slice(-options.tail);
    }

    return logs;
  }

  private async getAllLogs(): Promise<StoredLogRecord[]> {
    try {
      const content = await readFile(this.logFilePath, 'utf8');

      return content
        .split('\n')
        .map(line => {
          try {
            return JSON.parse(line) as StoredLogRecord;
          } catch {
            return null;
          }
        })
        .filter(log => log !== null);
    } catch (error) {
      console.log('[Tidewave] failed to read from log file, error:', error);
      return [];
    }
  }
}

export const tidewaveLogger = new TidewaveLogger();
