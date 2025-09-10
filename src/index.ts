// src/index.ts
export { extractSymbol, extractDocs, getSourceLocation, formatOutput } from './resolution';
export * from './core';

import { extractDocs, getSourceLocation, formatOutput } from './resolution';
import { executeIsolated } from './evalation/code_executor';

export const Tidewave = {
  extractDocs,
  getSourceLocation,
  formatOutput,
  executeIsolated,
};
