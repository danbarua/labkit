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
- [x] ~~**Typed write commands.**~~ — done. `src/domain/commands.ts` names the
  fifteen command shapes `write.ts` declared inline, exported from the barrel so
  an adapter can hold one before issuing it. Extraction only — every shape is
  the one its verb already had, so no call site changed and `tsc` proves it.
  Verbs taking a single scalar (`pose`, `openEnquiry`, `stateCriterion`) are
  deliberately not wrapped.
- [x] ~~**Gap analysis: what an agent needs to track work in LabKit rather than
  in Markdown.**~~ — **deleted, not done.** It was a corpus review standing in
  front of obvious work. The verbs exist because scenarios earned them one at a
  time, so "which should be exposed" defaults to all of them, and a review would
  have been looking for reasons to exclude. The two real gaps were found by
  building instead: no write tool existed at all, and no read tool returned
  enquiry ids, so a reconnecting agent could not find an enquiry to work in.
  Both are closed.

- [ ] **The other nine write tools.** Six are exposed — `pose`, `pursue`,
  `open_enquiry`, `record_observations`, `record_analysis`, `close_enquiry` —
  which is the loop that makes a programme exist. The rest of
  `src/domain/commands.ts` follows the identical pattern. **`promote` first**:
  without it a concluded question can only reach `provisional`, never
  `established`, which `tests/mcp.test.ts` currently asserts as the state of
  affairs rather than as a defect.

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
