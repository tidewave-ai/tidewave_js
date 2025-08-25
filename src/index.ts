// src/index.ts
export { extractSymbol, extractDocs, getSourcePath, formatOutput } from './extraction/typescript';
export * from './core/types';

import { extractDocs, getSourcePath, formatOutput } from './extraction/typescript';

export const TidewaveExtractor = {
  extractDocs,
  getSourcePath,
  formatOutput,
};
