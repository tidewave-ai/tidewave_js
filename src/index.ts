// src/index.ts
export { extractSymbol, extractDocs, getSourceLocation, formatOutput } from './resolution';
export * from './core';

import { extractDocs, getSourceLocation, formatOutput } from './resolution';

export const TidewaveExtractor = {
  extractDocs,
  getSourceLocation,
  formatOutput,
};
