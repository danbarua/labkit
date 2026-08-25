/**
 * Turning argv into things the domain accepts — the interface between the
 * outside world and the model, and the only place in `src/cli/` that knows a
 * value arrived as text.
 *
 * **Every coercion here throws `InvalidArgumentError`**, which is commander's
 * way of saying *the caller made a mistake*. It prints the option's name with
 * the message and exits 1, and it is distinct from an error thrown by a domain
 * verb — several verbs **refuse** on purpose (closing on exploratory evidence,
 * reinterpreting into wording that changes nothing), and those refusals are the
 * record working. A refusal must not be dressed as a typo.
 *
 * Validation is zod's, not a second implementation of it. It is already a
 * dependency, it already holds every I/O shape the MCP tools declare, and the
 * alternative was six more packages to get `.check()` and coercion this file
 * gets in four lines.
 */

import { InvalidArgumentError } from "commander";
import { z } from "zod";
import { ref } from "../domain/report";
import type { AnalysisRef, Conclusion, ObservationsRef, Ref } from "../domain";

/**
 * A whole number, refused rather than coerced.
 *
 * `Number("abc")` is `NaN`, which reaches `pgEventLog` as a bound SQL parameter
 * and comes back as an empty result — a wrong-shaped answer to a question the
 * caller mistyped, rather than an error naming the flag. `int()` also refuses
 * `1.5`, which a sequence cursor cannot be.
 */
export function whole(raw: string): number {
  const parsed = z.coerce.number().int().safeParse(raw);
  if (!parsed.success) throw new InvalidArgumentError(`takes a whole number, not \`${raw}\``);
  return parsed.data;
}

/**
 * A handle of a named kind.
 *
 * `ref()` already refuses a mismatch — `ref("gate", "CLM_1")` throws, because
 * an id's prefix names the label a kind expects. This carries that refusal to
 * the boundary, so a caller who passes a claim where a gate belongs is told
 * which argument was wrong instead of watching a stack trace.
 */
export function handle<K extends string>(kind: K): (raw: string) => Ref<K> {
  return (raw) => {
    try {
      return ref(kind, raw);
    } catch (e) {
      throw new InvalidArgumentError((e as Error).message);
    }
  };
}

/**
 * An option that may be given more than once, collected in order.
 *
 * This is how a **list of handles** is given: `--from ART_1 --from COMP_2`. A
 * natural id has no punctuation to collide with, so repetition is safe where a
 * delimiter would not be. Commander calls this with `(value, previous)`, and
 * the default has to be supplied at the option site — an omitted option never
 * calls the coercion at all.
 */
export function collect<T>(coerce: (raw: string) => T) {
  return (raw: string, previous: T[] = []): T[] => [...previous, coerce(raw)];
}

/**
 * One id, resolved to the ref kind its prefix names.
 *
 * The same discrimination `TenantGraph.createEdge` makes, from the same table,
 * and for the same reason: an analysis reads a mix of raw observations and
 * earlier analyses, and the prefix is the only thing that says which is which.
 */
export function inputRef(raw: string): ObservationsRef | AnalysisRef {
  if (raw.startsWith("COMP_")) return handle("analysis")(raw);
  if (raw.startsWith("ART_")) return handle("observations")(raw);
  throw new InvalidArgumentError(
    `\`${raw}\` is neither observations (ART_…) nor an analysis (COMP_…)`,
  );
}

/**
 * One conclusion, as JSON.
 *
 * JSON and not a delimited string, which is not a style choice:
 * `PlanWorkCommand.mayRead` is stored as JSON inside the domain for the reason
 * its doc comment gives — an entry containing the delimiter splits silently —
 * and a conclusion carries two sentences of a researcher's prose, which is the
 * worst possible thing to put either side of a separator character.
 *
 * The shape is zod's, so the message names the field rather than the argument.
 */
const conclusionShape = z.object({
  proposition: z.string().min(1),
  finding: z.string().min(1),
  bearing: z.enum(["supports", "challenges"]).optional(),
  standing: z.enum(["exploratory", "confirmatory"]).optional(),
});

export function conclusion(raw: string): Conclusion {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidArgumentError(
      `takes JSON: '{"proposition": "…", "finding": "…"}'  (got \`${raw}\`)`,
    );
  }
  const result = conclusionShape.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0]!;
    throw new InvalidArgumentError(
      `${first.path.join(".") || "value"}: ${first.message}`,
    );
  }
  return result.data;
}

/**
 * A `<part-id>=<hash>` pair.
 *
 * Positional rather than a repeated flag, because it is a pair and an option
 * carries one value. Omitting them all is meaningful and is not an empty
 * answer: it asks what the record can account for on its own.
 */
export function rebuilt(raw: string): { part: ObservationsRef; hash: string } {
  const at = raw.indexOf("=");
  if (at < 1) throw new InvalidArgumentError(`\`${raw}\` is not <part-id>=<hash>`);
  return { part: handle("observations")(raw.slice(0, at)), hash: raw.slice(at + 1) };
}
