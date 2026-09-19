/**
 * A domain verb refused the act. Distinguishes a missing handle, an
 * ambiguous wording, and a broken invariant so a caller can branch without
 * parsing the sentence.
 */
import type { AnyRef } from "./ref";

export class DomainRefusal extends Error {
  readonly kind: "not-found" | "ambiguous" | "invariant";
  readonly subject?: AnyRef;

  constructor(opts: {
    kind: "not-found" | "ambiguous" | "invariant";
    message: string;
    subject?: AnyRef;
  }) {
    super(opts.message);
    this.name = "DomainRefusal";
    this.kind = opts.kind;
    this.subject = opts.subject;
  }
}
