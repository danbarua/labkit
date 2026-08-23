# 012: The write surface completed, and the docs page read as a diagnostic

**Session wrap, 2026-08-23, on `feat/mcp-server`.** Not a decision record. The
ambiguity found here is queued in `docs/TASKS.md`, not settled.

**On the range warning:** `collect.sh` flags `c525f89` as belonging to entry
011. It does not belong to another *session* — 011 is this same session's,
closed earlier today, and this commit corrects two sentences inside it. The
detector reports a lower bound and cannot tell those cases apart. Nothing from
011 is restated below.

## Goal

Answer a question from Dan — does anything actually depend on the event log
being persisted? — then clear the queue: expose every remaining write verb, and
read the generated documentation looking for what it would surface.

## Changed

Two commits (plus this entry).

**`c525f89` — two framings corrected.**

- `src/mcp/server.ts` — the comment where the event sink is constructed.
- `docs/session-log/011_naming_the_write_commands.md` — the matching line.
- `docs/TASKS.md` — two new queue items.

**`ab8a197` — the write surface completed.**

- `src/mcp/tools.ts` — twelve more write tools: `sharpen`, `record_review`,
  `plan_work`, `state_criterion`, `declare_gate`, `evaluate_criterion`,
  `reverify`, `accept_as_unresolved`, `promote`, `amend_design`,
  `replace_analysis`, `reinterpret`. **Every verb on `WriteSurface` is now
  reachable over MCP**, and every command shape in `src/domain/commands.ts` has
  a caller.
- `src/mcp/schemas.ts` — output schemas for the reports those verbs return, each
  gated by `Exact<>` like the rest.
- `tests/mcp.test.ts` — two more end-to-end loops over the wire, and the
  `provisional` marker from entry 011 replaced by both sides of `promote`.
- `docs/TASKS.md` — "Ready to build" is now empty.

## Verified

- **Nothing depends on the event log.** `src/domain/read.ts` contains **zero**
  references to `events`. The only writer is `write.ts`'s single `emit` choke
  point. The only readers are tests, and S-1, S-7 and S-12 assert
  `events.all()` has length **0** at the moment a historical answer is read —
  the log being empty is the assertion, because it proves the answer came from
  durable state rather than replay. S-11 reads the log for an unrelated reason:
  that a compound verb emits one event, not one per step.
- **The `ART_` ambiguity is naming, not behaviour** — established by building
  it both ways in a throwaway test, not by reading the code. Recording an
  analysis with `from: [analysisRef]` and with
  `from: [{kind: "observations", id: <that analysis's own output artefact>}]`
  produced an **identical** record: the same `CONSUMES` edge, and
  `reproducibilityOf` reporting the same `{part: "ART_2", name: "stage one
  output"}` for both. The probe was deleted once it had answered.
- After `c525f89`: `typecheck` and `check:doc-comments` exit 0,
  `tests/mcp.test.ts` 14 pass. Full suite not re-run — comments and Markdown
  only.
- After `ab8a197`: **`bun test` 287 pass, 0 fail, 38 files, 93.7s**; typecheck,
  depcruise, `check:doc-comments`, `check:tests-assert`, `check:stdout` all
  green.

**Two properties now asserted over the wire that were not before.** A gate is
computed from its checks, never set — the test records an analysis held to a
prespecified criterion and asserts `unmet` is **non-empty before the check is
run**, which is the whole reason a criterion is stated up front. And `promote`
is asserted on both sides: a concluded question is `provisional` before it and
`established` after.

**The generated documentation was read as a diagnostic, and it worked.** This
was Dan's prediction — that with the whole surface exposed, one page would show
discrepancies no single tool shows. It surfaced three:

1. The **read** tools' id parameters carried no prefix examples and the
   **write** tools' did, because the reads were written first. Invisible per
   tool; a ragged column on one page. Fixed in the same commit.
2. `from` means two unrelated things — a list of sources in `record_analysis`,
   the question being sharpened in `sharpen`.
3. Of the three verbs that record a computation, **only one can consume another
   analysis's output**: `RecordAnalysisCommand.from` is
   `Array<ObservationsRef | AnalysisRef>`, while `ReplaceAnalysisCommand.from`
   and `ReverifyCommand.under` are `ObservationsRef[]`.

Item 3 was measured before being written down, using the same probe as the
`ART_` finding: **it is not a functional gap.** The workaround — passing the
analysis's output artefact id as an `ObservationsRef` — produces an identical
record. What is wrong is three verbs disagreeing in their types about what they
accept while writing the same edge.

## Open

- **`ObservationsRef` says `kind: "observations"` and carries an Artefact id**,
  the same prefix an analysis's *output* carries. A caller holding an `ART_` id
  cannot tell raw measurement from a computed result, and `what_depends_on`
  accepts either. Queued as **needing a discriminator** — a read that gives a
  confidently wrong answer because the two are indistinguishable — rather than
  as a defect, because the measurement above says nothing is wrong today.

  It was surfaced by writing `inputRef()` in `src/mcp/tools.ts`, which has to
  recover a ref kind from a prefix. That function guessed `EU_` first, which is
  plausible from the type's name and wrong.

- **The three-verb asymmetry above**, queued as needing a discriminator: a case
  where the workaround gives a *wrong* answer rather than an inelegant call.

- **Both open items share one root, and it is the first real domain question
  this build-out has raised.** An artefact id does not say what kind of artefact
  it is. `ART_` covers raw observations and analysis outputs alike,
  `ObservationsRef.kind` asserts `"observations"` about either, and the three
  recording verbs each guessed differently about what to accept. Neither item
  gives a wrong answer today, which is why both wait for a discriminator rather
  than for work.

- The docs resource's diagnostic value depends on `.describe()` text carrying
  prefixes, because the renderer takes types from JSON Schema. Keeping that
  habit is what keeps the page readable as an audit.

- The event sink stays in-memory. What would earn a durable one is a consumer:
  an audit log, MCP notifications, or a projection to another view model.

## Next

**"Ready to build" is empty.** What remains in `docs/TASKS.md` is two
discriminators — both on the artefact-identity question above — and the
flaky-suite ceiling item Dan deprioritised. None is shippable work without a
decision first.

The obvious unbuilt thing nobody has asked for: a durable event sink. It stays
unbuilt until a consumer exists — an audit log, MCP notifications, or a
projection to another view model.
