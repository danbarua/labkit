# 017: Docs swept against what the code now does

**Session wrap, 2026-08-23, on `feat/mcp-server`.** Not a decision record. This
is the handover written immediately before a context compaction — the "Next"
section is the one to read on resuming.

## Goal

Sweep `CLAUDE.md` and `docs/TASKS.md` for claims the last few days of work made
false, then hand over.

## Changed

One commit, `ad5f99b`. No code.

**`CLAUDE.md`** — three false claims, all about the MCP server:

- *"the same reads for an agent caller, seven tools over stdio"* — it reads
  **and writes**, and the count now lives in `docs/mcp-tools.md` rather than in
  that sentence. That paragraph was itself an instance of the rule it sits three
  screens below.
- The layering diagram said `(MCP, later)`.
- The removed CQRS views were still described as waiting on *"the MCP/CLI read
  layer"*, which has since been built without them — so that is now recorded as
  a case that was tried and did not want them.

Its identity section now describes the API as built: handles are `Ref`s, verbs
take them, reports carry `{handle, wording}` pairs, a minting verb returns what
it minted, and `claimsAsserting` is the single seam where text becomes a handle.
It states the consequence rather than leaving it to be rediscovered —
`whySupported` cannot answer about a proposition nobody has claimed.

**`docs/TASKS.md` 190 → 104 lines.** It declared *"only actionable items live
here"* and had accumulated **seven** struck-through `[x]` entries. Finished items
are deleted now and the file says so: git history is the record.

**`docs/project-journal/030`** said the multi-pursuit remedy was *"not
decided"*. It is, and by **neither** of the two options originally put:
`EnquiryStatus` is `{enquiry, pursuing, contributed, question}`. The collapse
was the defect, not the verb count, so no second verb was needed.

## Verified

- `typecheck`, `depcruise`, `check:doc-comments`, `check:tests-assert`,
  `check:stdout` — all green.
- `bun test` **not re-run**: this commit changes Markdown only. The last full
  run, at `0564bb7`, was **298 pass, 0 fail, 39 files**.

## Open

Nothing new. `docs/TASKS.md` is the queue and is current as of this commit.

## Next

**`docs/TASKS.md` → "Ready to build" → first item.** Four report fields still
carry claim wording with no handle:

```
InterpretationHistory.originally / .nowClaims
Revision.previously / .nowClaims
ReinterpretationReport.previously / .nowClaims
ReplacementReport.affected / .unchanged
```

A `ClaimRef` is available at every one, so each is a projection change of the
kind PJ-030 §5 describes. **Method: change the type, let `tsc` name the sites** —
that is what worked for the last three passes and what reading the code did not.
Watch the one trap PJ-030 §5 records: a field that changes *meaning* without
changing *type* is invisible to `tsc`, so grep the readers when a `string` stays
a `string`.

State of the branch: **50+ commits, PR #2 open, 298 pass / 0 fail**, every
`WriteSurface` verb exposed over MCP, `docs/mcp-tools.md` checked in and held
fresh by one assertion in `tests/mcp.test.ts`.
