/**
 * Barrel file that re-exports symbols from reexport-source.
 * Used to test that extractDocs resolves aliased (re-exported) symbols.
 */
export { add, Counter, Status, Result } from './reexport-source';
