# 012: Two framings corrected, and an ambiguity measured

**Session wrap, 2026-08-23, on `feat/mcp-server`.** Not a decision record. The
ambiguity found here is queued in `docs/TASKS.md`, not settled.

**On the range warning:** `collect.sh` flags `c525f89` as belonging to entry
011. It does not belong to another *session* — 011 is this same session's,
closed earlier today, and this commit corrects two sentences inside it. The
detector reports a lower bound and cannot tell those cases apart. Nothing from
011 is restated below.

## Goal

Answer a question from Dan — does anything actually depend on the event log
being persisted? — and fix what the answer showed was written wrongly.

## Changed

One commit, `c525f89`.

- `src/mcp/server.ts` — the comment where the event sink is constructed.
- `docs/session-log/011_naming_the_write_commands.md` — the matching line.
- `docs/TASKS.md` — two new queue items.

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
- `bun run typecheck`, `bun run check:doc-comments` — exit 0.
  `bun test tests/mcp.test.ts` — 14 pass, 0 fail. Full suite not re-run: the
  commit changes comments and Markdown only.

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

- **The generated documentation may be a diagnostic**, and is queued as one.
  `labkit://docs/tools` renders every tool's ids and ref kinds onto a single
  page from the declarations. At six write tools there is not enough surface for
  an inconsistency to read as one; at fifteen there should be. Caveat recorded
  with it: the renderer takes types from JSON Schema, so a prefix shows up only
  where a `.describe()` mentions it — which makes describing prefixes
  consistently part of what would make the document diagnostic.

- The event sink stays in-memory. What would earn a durable one is a consumer:
  an audit log, MCP notifications, or a projection to another view model.

## Next

`docs/TASKS.md`, "Ready to build" — `promote`, then the remaining eight write
tools, then read `labkit://docs/tools` end to end looking for exactly the class
of discrepancy the `ART_` item describes.
