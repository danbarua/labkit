/**
 * A view is a function from a report to the text a terminal shows.
 *
 * **`--json` is a view like any other**, and saying so is the whole of this
 * file. The monolithic CLI had a `show(json, value, prose)` helper that took a
 * boolean and a thunk, which made JSON a *mode* the program was in rather than
 * a choice of renderer — and modes leak: every command had to remember to pass
 * both halves, and a command that forgot printed prose to a caller that had
 * asked for a program-readable answer.
 *
 * Here a command answers with a value and the view that reads it, and the
 * runner picks between that view and {@link asJson}. A command cannot get it
 * wrong because it never sees the flag.
 *
 * **What `--json` prints is the domain report itself**, not a CLI-shaped
 * projection of it, and that is what keeps it the same document an MCP client
 * gets: `src/mcp/schemas.ts` is pinned to `src/domain/report.ts` at compile
 * time, so a report serialised here parses against the schema the MCP tool
 * declares for the same verb.
 *
 * **With one honest exception, and it is MCP's, not ours.** A tool whose answer
 * is a bare array or a bare handle wraps it — `{"claims": […]}`,
 * `{"enquiries": […]}` — because MCP's `structuredContent` must be an object.
 * The CLI has no such constraint and prints the array. So the claim the test
 * makes is the precise one: the CLI's JSON parses against the MCP schema for
 * the same verb, **after unwrapping the single-key envelope where MCP declares
 * one**. Reshaping here to match a wire format the terminal does not use would
 * be the tail wagging the dog.
 *
 * The CLI does not import those schemas to achieve any of this — the agreement
 * is asserted in a test, which keeps the dependency out of the code and the
 * claim in one place. See `tests/cli/json-contract.test.ts`.
 *
 * There is deliberately no `--no-ansi` yet. Nothing here emits an escape
 * sequence, and a flag that switches off something the program does not do is
 * a promise rather than a feature. It arrives with the first colour.
 */

import type { Palette } from "./palette";

/**
 * How one report reads. Pure — it returns text and prints nothing.
 *
 * The `Palette` is a parameter rather than a module-level global so a test can
 * render the same report twice, coloured and plain, and assert on both. A
 * global would resolve at import time to whatever `bun test`'s non-TTY stdout
 * implies, and every fixture would silently check the uncoloured path only.
 */
export type View<T> = (value: T, palette: Palette) => string;

/**
 * What a command answers with: the report, and how to read it.
 *
 * The value is the domain's, unaltered. A command that reshapes it before
 * answering has made `--json` a different document from the one the MCP tool
 * returns for the same verb, which is the divergence this pairing exists to
 * make impossible to introduce quietly.
 *
 * **`render` is bound rather than left as a `View<T>` field**, and the reason
 * is not cosmetic: a `View<T>` in an interface is a function *parameter*
 * position, so `Answer<KnowledgeSurvey>` is not assignable to `Answer<unknown>`
 * and the runner cannot accept two commands answering with different reports.
 * `known` is exactly that command — it returns one of two genuinely different
 * surveys (S-1). Binding at construction keeps the pairing checked where it is
 * made and erases the type where nothing needs it.
 */
export interface Answer<T = unknown> {
  value: T;
  render(palette: Palette): string;
}

/** Pairs a report with its view. This is where the two are held to each other. */
export function answer<T>(value: T, view: View<T>): Answer<T> {
  return { value, render: (palette) => view(value, palette) };
}

/**
 * The `--json` view. Indented, because a person reads this too when debugging.
 *
 * **Never coloured, and it does not take the palette to prove it.** `--json` is
 * for a caller that is a program; an escape sequence inside a JSON string would
 * be a bug in whatever parses it.
 */
export const asJson = (value: unknown): string => JSON.stringify(value, null, 2);

/**
 * The view for an act, as opposed to a question.
 *
 * Every write command prints the handles it minted and nothing else, one per
 * line, because that is what the next command takes:
 * `labkit close "$(labkit analyse …)"` only composes if the id is the whole of
 * stdout. This is the transport half of the repo's rule that **a verb that
 * mints something returns what it minted** — the verbs already do, and a CLI
 * printing "done" would put the caller back to searching for what they had
 * just made.
 *
 * **Never coloured, even in a terminal, and that is not an oversight.** This
 * output is *data*: the whole of stdout is an id the next command consumes.
 * Colouring it made `$(labkit criterion …)` capture
 * `\u001b[36mCRIT_2\u001b[39m` under `FORCE_COLOR=1` — measured, not
 * predicted — which turns a documented contract into something conditional on
 * an environment variable. A report gets colour because a person reads it; a
 * handle does not, because a shell does.
 */
export const asHandles: View<readonly string[]> = (handles) => handles.join("\n");
