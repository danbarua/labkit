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
  indistinguishable. The nearest thing to one was the three recording verbs
  disagreeing about their inputs, and that turned out to be a separate defect:
  fixing it (all three take `InputRef`) left this untouched, because the caller
  now names *the analysis*, not its output artefact, and never sees the `ART_`
  id at all.

- [ ] **A replacement may consume the output it just invalidated.**
  `replaceAnalysis` invalidates `supersedes`'s output and then records the
  replacement; nothing stops `from` naming `supersedes`, or the artefact under
  it. Reachable before the `InputRef` change too — passing the `ART_` id did
  the same thing — so this is not new, just newly easy to write. Needs a read
  that gives a **wrong answer** because of it: today the record says plainly
  that the input is invalidated, which is unhelpful rather than incorrect.
  Adding a refusal without that is manufacturing one, which PJ-019 forbids.

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
