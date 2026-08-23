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

- [ ] **`ART_` does not say what kind of artefact it is.** `ObservationsRef`'s
  `kind` is `"observations"` and its id is an **Artefact** id — the same prefix
  an analysis's *output* carries. So a caller holding an `ART_` id cannot tell
  raw measurement from a computed result, and `what_depends_on` takes either.

  **Measured, not argued: this is naming, not behaviour.** Recording an analysis
  with `from: [analysisRef]` and with `from: [{kind:"observations", id: <that
  analysis's output artefact>}]` produce an *identical* record — both write the
  same `CONSUMES` edge, and `reproducibilityOf` reports the same
  `{part, name}` for both. Nothing is wrong today; what is wrong is that the
  type's `kind` says "observations" about something that is not, and an agent
  reasoning from the prefix has no way to know.

  Surfaced by writing `inputRef()` in `src/mcp/tools.ts`, which had to guess a
  ref kind from a prefix and guessed a plausible wrong one first (`EU_`). Needs
  a discriminator before it is worth changing anything: a read that gives a
  confidently wrong answer because the two are indistinguishable.

- [x] ~~**The other write tools.**~~ — done. **Every verb on `WriteSurface` is
  now an MCP tool**, and every command shape in `src/domain/commands.ts` is
  reachable. `bun run mcp` exposes the reads, `pursuits_of`, and the writes.

- [x] ~~**Read the generated documentation as a diagnostic.**~~ — **done, and
  it worked.** With every verb exposed, `labkit://docs/tools` renders to one
  page, and reading the id-bearing fields down that page surfaced three things
  no single tool showed on its own:

  1. **The read tools' id descriptions had no prefix examples and the write
     tools' did**, because the reads were written first. Visible immediately as
     a ragged column. **Fixed** — every id parameter now names its prefix.
  2. **`from` means two unrelated things.** `record_analysis.from` is a list of
     sources; `sharpen.from` is the question being sharpened. Not a defect, but
     nobody would choose it, and only the one-page view shows it.
  3. **The asymmetry below**, which is the real find.

- [ ] **Only one of the three verbs that record a computation can consume
  another analysis's output.** `RecordAnalysisCommand.from` is
  `Array<ObservationsRef | AnalysisRef>`; `ReplaceAnalysisCommand.from` and
  `ReverifyCommand.under` are both `ObservationsRef[]`. So a second-stage
  analysis can be recorded but, by the types, not replaced or re-verified in
  terms of the stage it consumed.

  **Measured before being written down, and it is not a functional gap.**
  Passing an analysis's *output artefact* id as an `ObservationsRef` produces an
  identical record to passing the `AnalysisRef` — same `CONSUMES` edge, same
  `{part, name}` from `reproducibilityOf` (see the `ART_` item below). So the
  workaround exists and is indistinguishable in the graph. What is wrong is the
  types disagreeing about what these three verbs accept, when all three write
  the same edge.

  Needs a discriminator: a case where the workaround gives a **wrong answer**,
  not merely an inelegant call. Related to the `ART_` item — both are the same
  root, that an artefact id does not say what kind of artefact it is.

## Needs a discriminator

- [ ] **Closing one pursuit closes every pursuit of the same question, and the
  untouched one reports evidence it never produced.** External review (ChatGPT,
  on PR #2) proposed the discriminator; run over MCP only, it fires:

  ```
  pose Q; pursue A; pursue B
  record + close A
  enquiry_status(A) -> open:false, closure:"answered", evidence:["yes"]
  enquiry_status(B) -> open:false, closure:"answered", evidence:["yes"]
  ```

  B was never worked on. It reports itself answered, carrying A's evidence.
  **That is a confidently wrong answer, not an empty one**, so it clears the
  bar in CLAUDE.md's "Changing the graph model" without needing a further probe.

  The cause is not a bug: `closeEnquiry()` writes `Decision -RESOLVES-> Question`
  and `enquiryStatus()` derives closure from the Question, both deliberately —
  closure attached to the question while one question had one pursuit. `pursue`
  makes that false.

  Two readings, and they need picking between rather than deferring, because one
  of them is already shipping a wrong answer:
  - Closure belongs to the **Question**, and the verb is named at the wrong
    level — it is `resolve_question(via_enquiry=A)`, and `enquiry_status` should
    report B as *pursuing an answered question* rather than as answered itself.
  - Closure belongs to the **LineOfEnquiry**, which then needs lifecycle
    semantics the model does not have.

- [ ] **A consumer holding only MCP handles cannot repair a two-stage
  pipeline.** The other half of the three-verb asymmetry, and the half PR #2
  got wrong. `record_analysis` accepts `COMP_` ids for `from`;
  `replace_analysis` does not, and an agent that recorded stage two holds
  `COMP_2`, never the `ART_` id underneath it. Measured over MCP only:

  ```
  replace_analysis(supersedes=A2, from=[A1]) ->
    isError: CONSUMES does not allow Computation -> Computation
  ```

  **PR #2 called this "not a functional gap" and that claim was under-
  demonstrated.** It was measured with an `ART_` id obtained inside the process;
  a consumer does not have one. The workaround is *recoverable* — the id shows
  up in `why_supported().restingOn` as `{part: "ART_4", name: "stage one
  output"}` — but only by asking why a claim is supported in order to find out
  what a computation read, which is not a route anyone would find.

  Likely fix, per the same review: one `InputRef = ObservationsRef |
  AnalysisRef` accepted by all three recording verbs. No graph change — the
  edge is already `Computation -CONSUMES-> Artefact` either way.

- [ ] **Six `ReadSurface` methods are unreachable over MCP**, so the generated
  documentation audits the adapter's subset and not the domain: `originOf`,
  `contractFor`, `criteriaGoverning`, `gateStatus`, `doTheseConflict`,
  `reproducibilityOf`. An agent can `plan_work`, `state_criterion` and
  `declare_gate` and then cannot ask what the contract is, which criteria govern
  the gate, or what state the gate is in.

  Needs a **mechanical coverage assertion**, not a one-off fix: every public
  `ReadSurface` method is exposed or explicitly excluded with a reason, derived
  from the prototype the way `tests/helpers/read-only.ts` derives write verbs.

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
