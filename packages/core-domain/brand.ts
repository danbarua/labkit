/**
 * Wire-string to branded-handle transforms. A leaf on `ref.ts` and zod — not
 * reports or events — so command and query schemas can share them.
 */

import { z } from "zod";
import { kindOf, ref, type Kind } from "./ref";

export function issue<T>(ctx: z.RefinementCtx, run: () => T): T {
  try {
    return run();
  } catch (e) {
    ctx.addIssue({ code: "custom", message: (e as Error).message });
    return z.NEVER;
  }
}

/** Handle field: wire string in, branded ref out. Uppercased first. */
export function refString<K extends Kind>(kind: K) {
  return z.string().transform((raw, ctx) => issue(ctx, () => ref(kind, raw.toUpperCase())));
}

export function anyRefString() {
  return z.string().transform((raw, ctx) =>
    issue(ctx, () => {
      const normalized = raw.toUpperCase();
      const kind = kindOf(normalized);
      if (!kind) throw new Error(`\`${raw}\` is not a handle this record recognises`);
      return ref(kind, normalized);
    }),
  );
}
