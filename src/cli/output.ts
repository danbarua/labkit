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

/** How one report reads. Pure — it returns text and prints nothing. */
export type View<T> = (value: T) => string;

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
  render(): string;
}

/** Pairs a report with its view. This is where the two are held to each other. */
export function answer<T>(value: T, view: View<T>): Answer<T> {
  return { value, render: () => view(value) };
}

/** The `--json` view. Indented, because a person reads this too when debugging. */
export const asJson: View<unknown> = (value) => JSON.stringify(value, null, 2);

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
 */
export const asHandles: View<readonly string[]> = (handles) => handles.join("\n");
