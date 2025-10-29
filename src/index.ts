// src/index.ts
import { extractDocs, getSourceLocation, formatOutput } from './resolution';
import type { EvaluatedModuleResult, EvaluationRequest } from './core';

export const Tidewave = {
  extractDocs,
  getSourceLocation,
  formatOutput,
  async executeIsolated(request: EvaluationRequest): Promise<EvaluatedModuleResult> {
    // Dynamic import to avoid bundling child_process.fork
    const { executeIsolated } = await import('./evaluation/code_executor');
    return executeIsolated(request);
  },
};
