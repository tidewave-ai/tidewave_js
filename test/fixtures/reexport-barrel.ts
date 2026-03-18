/**
 * Barrel file that re-exports symbols from reexport-source.
 * Used to test that extractDocs resolves aliased (re-exported) symbols.
 */
export { add, Counter, Status } from './reexport-source';
export type { Result } from './reexport-source';
