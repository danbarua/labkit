# Outstanding work

**A queue, not a record.** Only actionable items live here — a finished item is
**deleted**, not struck through; git history is the record. What the model knows
lives in PJ-008 §3's index table; standing facts and gates live in CLAUDE.md.
Neither is restated here — see CLAUDE.md, "The one rule about documents".

---

## Ready to build

- [ ] **`interpretationHistory` walks by wording.** Its entry point is a
  handle, its loop guard is keyed by claim id, and every step now *reports*
  handles — but the traversal still finds each step by the *name* of the one
  before it (`MATCH (d:Decision)-[:MOTIVATES]->(nxt:Claim {name: $name})`).
  Walking by id wants the revision chain to carry an edge a caller can follow,
  which is a model question rather than a projection.


## Needs a discriminator

- [ ] **`ART_` does not say what kind of artefact it is.** `ObservationsRef`'s
  `kind` is `"observations"`; its id is an **Artefact** id, the same prefix an
  analysis's *output* carries. A caller holding one cannot tell raw measurement
  from a computed result, and `what_depends_on` takes either.

  **Measured, not argued: naming, not behaviour.** Recording an analysis with
  `from: [analysisRef]` and with `from: [{kind:"observations", id: <that
  analysis's output artefact>}]` produce an identical record — same `CONSUMES`
  edge, same `{part, name}` from `reproducibilityOf`.

  Needs a read that gives a **wrong answer** because the two are
  indistinguishable.

- [ ] **The three verbs that record a computation disagree about their inputs.**
  `RecordAnalysisCommand.from` is `Array<ObservationsRef | AnalysisRef>`;
  `ReplaceAnalysisCommand.from` and `ReverifyCommand.under` are
  `ObservationsRef[]`. All three write the same `Computation -CONSUMES->
  Artefact` edge.

  **The consumer half is demonstrated**, over MCP only:

  ```
  replace_analysis(supersedes=A2, from=[A1])
    -> isError: CONSUMES does not allow Computation -> Computation
  ```

  An agent that recorded stage two holds `COMP_2` and never the `ART_` id
  underneath it. The workaround is reachable — the id surfaces in
  `whySupported().restingOn` — but only by asking why a claim is supported in
  order to learn what a computation read. Likely fix: one `InputRef` accepted by
  all three. Same root as the `ART_` item above.

- [ ] **Row AF — execution input order is not recorded.** `CONSUMES` says which
  artefacts a computation read, never in what sequence, so two runs of an
  order-sensitive method are indistinguishable (S-10b). Earns nothing under the
  wrong-answer bar: the reports claim the two runs consumed the same inputs, and
  they did — what a reader *infers* is the wrong part. Needs a reader acting on
  "reproduced" for a reversed run and being wrong in a way the record **states**
  rather than implies. Unowned.

## Deprioritised

- [ ] **The suite crosses bun's fixed 5000ms ceiling and those tests fail.**
  Dan deprioritised this; it is not obstructing work. The cascade that turned
  one crossing into a burst is fixed (`2de1060`, `5439085`); provisioning got
  69% cheaper again in `6eeeb92`. What remains is the crossings themselves.

  **Do not re-investigate from scratch.** Refuted with evidence: advisory-lock
  contention; the pglite-socket desync bug as primary mechanism; fd/socket
  exhaustion; WASM heap growth; `afterAll` not awaited; bun's runner. Use
  `LABKIT_TRACE=all` — `src/db/trace.ts` exists so the next investigation does
  not rebuild instrumentation.

  **Named, not built:** drive `begin()`/`end()` from `beforeEach`/`afterEach`;
  short-circuit provisioning for `current()`; raise the ceiling (hides it).

  **Measure paired and interleaved, one variable.** An earlier fix passed round
  one on both arms and failed at the lowest load of four.

## Deliberately not being done

Here so nobody re-discovers them as gaps.

- **Bitemporality.** Record-time versus belief-time is real and unrepresentable,
  and no source obligation requires it. `Decision.decided_at` is record time.
- **An instant on `EvidenceUnit`.** Would let `whatWasKnown()` split `open` into
  worked-on and untouched. Nothing has needed it.
- **A durable event sink.** `read.ts` never touches `events`, and the scenarios
  that mention the log assert it is *empty* when a historical answer is read.
  It is a SQL table and a reader; what it waits on is a consumer — an audit log,
  MCP notifications, or a projection to another view model.

---

## Setup a new clone or worktree needs

**Moved to CLAUDE.md, "First, in a fresh clone or worktree"** (2026-08-22).
