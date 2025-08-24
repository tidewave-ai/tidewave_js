import type { ModuleRequest, ResolvedModule, ResolveError } from '../core/types';

export interface ResolutionStrategy {
  readonly name: string;
  readonly cache: ReadonlyMap<string, ResolvedModule>;
  readonly canResolve: (request: ModuleRequest) => boolean;
  readonly resolve: (request: ModuleRequest) => Promise<ResolvedModule | ResolveError>;
}

export function getCacheKey(request: ModuleRequest): string {
  return `${request.source}:${request.specifier}`;
}
