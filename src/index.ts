// src/index.ts
import { extractDocs, getSourceLocation, formatOutput } from './resolution';
import { executeIsolated } from './evaluation/code_executor';

export const Tidewave = {
  extractDocs,
  getSourceLocation,
  formatOutput,
  executeIsolated,
};
