// src/index.ts
export { extractSymbol, extractDocs, getSourcePath, formatOutput } from './resolution';
export * from './core';

import { extractDocs, getSourcePath, formatOutput } from './resolution';

export const TidewaveExtractor = {
  extractDocs,
  getSourcePath,
  formatOutput,
};
