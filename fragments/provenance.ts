/**
 * The fragment currently executing, for the Explorer's per-step provenance.
 *
 * Global and mutable rather than threaded on the call stack, because nothing
 * in `fragments/` calls another fragment — every composition calls a
 * `WriteSurface` move directly, one at a time (see `fragments/index.ts`'s
 * header), so there is no nesting for a stack-scoped version to get right
 * that this doesn't already get right. `fragments/tagged.ts` sets it around
 * each call; `fragments/derive.ts` reads it when an event is recorded.
 */
export const currentFragment: { name: string | undefined } = { name: undefined };
