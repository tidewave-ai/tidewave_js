// src/index.ts
export { extractSymbol, extractDocs, getSourceLocation, formatOutput } from './resolution';
export * from './core';

import { extractDocs, getSourceLocation, formatOutput } from './resolution';

export const Tidewave = {
  extractDocs,
  getSourceLocation,
  formatOutput,
};
