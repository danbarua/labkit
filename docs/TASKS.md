# Outstanding work

**A queue, not a record.** Only actionable items live here. What the model knows
lives in PJ-008 §3's index table; standing facts and gates live in CLAUDE.md.
Neither is restated here — see CLAUDE.md, "The one rule about documents".

---

## Ready to build

- [x] ~~**`outputSchema` on the MCP tools.**~~ — done. `src/mcp/schemas.ts`
  mirrors the report types and `tsc` holds each mirror to its interface. Six of
  seven tools declare one; `known` cannot, because the SDK's
  `normalizeObjectSchema` returns `undefined` for a union rather than throwing.
  **Residual gap, measured:** an optional field that no test data produces can
  be dropped from a schema and neither `tsc` nor the parse test notices.
  Widening the seed in `tests/mcp.test.ts` is what narrows it.
- [ ] **Typed write commands.** `src/domain/write.ts`'s verbs take untyped
  object arguments. A named type per command gives the write half the same
  shape the read half is about to get, and is the precondition for exposing any
  write tool over MCP.
- [ ] **Gap analysis: what an agent needs to track work in LabKit rather than in
  Markdown.** Read the corpus for the minimum domain surface that has to reach
  MCP for that to be true. This is the one that decides how much of the write
  side gets exposed, so do it before building write tools.

- [ ] **The suite crosses bun's fixed 5000ms ceiling and those tests fail.**
  Deprioritised by Dan; not obstructing work. The cascade that turned one
  crossing into a burst is fixed (`2de1060` FIFO connection ownership,
  `5439085` truncate instead of dropping the graph — the second also took
  provisioning off the critical path and halved suite wall time). Provisioning
  got 69% cheaper again in `6eeeb92`. What remains is the crossings themselves.

  **Do not re-investigate from scratch.** Refuted with evidence: advisory-lock
  contention; the pglite-socket desync bug as primary mechanism; fd/socket
  exhaustion; WASM heap growth; `afterAll` not awaited; bun's runner. Use
  `LABKIT_TRACE=all` — `src/db/trace.ts` exists so the next investigation does
  not rebuild instrumentation.

  **Named, not built:** drive `begin()`/`end()` from `beforeEach`/`afterEach`;
  short-circuit provisioning for `current()`; raise the ceiling (hides it).

  **If you measure this, measure it paired and interleaved, one variable.** An
  earlier fix passed round one on both arms and failed at the lowest load of
  four; shipping on round one would have shipped a regression. A clean run
  cannot verify a claim about what happens during a flake.

## Needs a discriminator

- [ ] **Row AF — execution input order is not recorded.** `CONSUMES` says which
  artefacts a computation read, never in what sequence, so two runs of an
  order-sensitive method are indistinguishable (S-10b). Earns nothing under the
  wrong-answer bar: the reports claim the two runs consumed the same inputs, and
  they did — what a reader *infers* is the wrong part. Needs a reader acting on
  "reproduced" for a reversed run and being wrong in a way the record **states**
  rather than implies. Unowned.

## Deliberately not being done

Here so nobody re-discovers them as gaps.

- **Bitemporality.** Record-time versus belief-time is real and unrepresentable,
  and no source obligation requires it. `Decision.decided_at` is record time.
- **An instant on `EvidenceUnit`.** Would let `whatWasKnown()` split `open` into
  worked-on and untouched. Nothing has needed it.
