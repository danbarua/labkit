# Consumer contract — design brief for cold-context designers

**Status: protocol, written 2026-08-20 on `feat/domain-consumer`, before any
designer has been run.** Committed first on purpose: this project records
predictions before a build so that a refutation survives as a result rather than
being edited into hindsight, and this probe gets the same treatment.

## Why a consumer, and not a sixteenth scenario

Fifteen scenarios have been built from the Bonsai corpus. Every one of them
pressed on relationships, query semantics or identity, and **the noun inventory
has not moved once** — thirteen node labels at the start, thirteen at the end,
zero migrations. The corpus is exhausted: no ledger row names an unbuilt owner.

That is a signal about the *method*, not a verdict that the model is right. An
authored scenario is written by someone who already knows the ontology, so it
can only press where its author thought to press. PJ-023's closing section names
the next probe accordingly: a **real consumer above the domain layer**, designed
**contract-first**, by people who have not seen the graph.

The instrument is simple. If independent designers, working only from what a
researcher wants, ask for something the model cannot express, that is a missing
noun found by someone with no stake in the current answer. If they ask only for
what the fifteen verbs already do, **that is also a result** — and a stronger
one than another green scenario, for the same reason row A's refutation was
worth more than its confirmation would have been.

## What designers are given

Exactly these, and nothing else:

| Source | Extent | Why |
| --- | --- | --- |
| `docs/project-journal/001_git_init.md` | **lines 5–31 only** — "What this is and isn't", "Overlap with W&B / MLflow" | The domain's own boundary. A designer must know this is a research control plane and not an experiment tracker, or they will design MLflow. |
| `docs/project-journal/001_git_init.md` | **lines 407–448** — "MVP Acceptance Criteria", "What this is and isn't about", "What this should and should not do", "Design Principles" | Behavioural constraints stated as obligations, not as structure. The should-nots are load-bearing: "should not accumulate ceremony", "should not confuse absence of evidence with failure". |
| `docs/project-journal/008_user_story_mining.md` | **§1 only, lines 72–188** — the eighteen "As a researcher…" stories with their one-line glosses | Researcher language, written before any model existed. This is the richest available statement of what someone actually wants. |

## What is withheld, and why each

- **`001_git_init.md` lines 32–406** — "LabKit's Graph of Interest", "LabKit
  Domain Entitites", "Rough Semantic Boundaries". This *is* the ontology: the
  entity list, their properties, the graph shape. Showing it would make the
  probe a comprehension test.
- **`008_user_story_mining.md` §2, §3, §4** — the acceptance scenarios, the
  design-pressure ledger, the held-back stories. §2's conversations are
  ontology-free by construction, but their commentary and every "Afterward"
  answer records what we decided; §3 is the model's argument with itself.
- **Every other project-journal entry**, `CLAUDE.md`, `src/`, `tests/`,
  `drizzle/`. `CLAUDE.md` alone would hand over the whole design.

## The honest limitation, stated up front

**This is blind to the model, not to the vocabulary.** The shared extracts
contain the words *claim*, *evidence*, *criterion*, *artefact*, *computation*
and *line of enquiry* — PJ-001's acceptance questions name "Claim C7" and
"Artefact A12" outright. Those words could not be removed without destroying the
material's meaning, and a researcher says them anyway.

What the designers cannot know is the part that matters: which of those are
nodes and which are edges; that `Evidence` and `EvidenceUnit` are two things;
that `Criterion`, `CriterionEvaluation` and `Gate` are three; what the edge
schema permits; that standing is conferred by an act; that gate state is
computed rather than stored. A designer converging on our nouns proves little.
A designer needing a noun we lack proves something.

Any write-up of the results must say this rather than claim a clean-room test.

## What each designer produces

Three artefacts, in this order. The third is the instrument; the first two exist
to make the third honest.

1. **The read surface.** The operations a researcher or an agent working for one
   would call, in researcher language: name, what you pass it, what comes back.
   Read-only — nothing that records or changes anything.
2. **Questions they expect to ask and expect to be refused.** Where they think a
   system like this would have to say "I can't answer that", and what they would
   want it to say instead.
3. **Nouns they needed that the brief never gave them.** Every word they reached
   for while writing (1) and (2) that does not appear in their source material.
   This is the actual finding; the rest is scaffolding for it.

Two rules for the designers:

- **Do not design a graph API.** No nodes, no edges, no traversals. If the
  answer is "walk from X to Y", the surface has leaked an implementation.
- **Do not soften a question because it sounds hard.** A question that seems
  unanswerable is worth more written down than dropped.

## Protocol

- **Three designers, independent, no cross-talk**, none told the others exist.
  Two can disagree by coincidence; three shows whether a disagreement is a
  coin-flip or a fault line.
- **No repository access.** They receive the extracts above as text. A designer
  who can run `grep` is no longer cold.
- Their outputs land in `docs/consumer-contract/` as `002`, `003`, `004`,
  verbatim, before anything is read across them.

## Predictions, recorded before running

Following the house rule that a prediction is only worth having if it was
written down first.

| Question | Prediction |
| --- | --- |
| Will a missing noun appear? | **Yes, and it will be "who".** Row S — no agent, person or role exists anywhere in the model — has been open since S-8 and unowned since. Predicting **at least two of three** designers ask for authorship or attribution on the read surface, because "who decided this" is the second question anyone asks after "why". |
| Second most likely | **Time at the survey level** (row Z). "What changed since last week", "what did we believe in March" — answerable for a single sharpening act, not across the record. Predicting at least one designer asks for it. |
| The shape they will want that we refuse | **A prioritised worklist** — "what should I do next". S-14 declined a `blocking` field on exactly these grounds, and PJ-001 forbids accumulating ceremony. If designers ask for it anyway, the tension is real and the refusal needs restating, not the feature building. |
| Free-text search | **Asked for by at least one, unsupported by anything.** No verb searches findings by content. Predicting it is asked and predicting it earns nothing, because a search box is a UI affordance, not a claim about the domain. |
| Rows F and O | **Not raised.** Both are subtle enough that they took a built scenario plus external review to surface. A designer working from stories should miss them. |
| The refutation | Three designers producing surfaces the existing fifteen verbs already satisfy. That would say the model is complete *for the uses anyone can currently imagine*, which is a real finding and the one this probe would most like to be wrong about. |
| New node labels | **One or none.** Thirteen has held through fifteen scenarios and two corpora's worth of pressure; a single exercise is unlikely to move it by more. |

## How this gets read afterwards

Against §3's bar, unchanged: a demonstrated **wrong** answer earns a model
change; an **empty** one does not, because a question the model has never been
asked is unanswerable rather than incorrect, and a missing feature manufactures
an empty result. A designer asking for something we cannot answer is an empty
result until someone shows the current model answering it **incorrectly**.

So the deliverable of this exercise is not a schema change. It is a list of
candidate wrong answers, which then have to be demonstrated the way every row on
the ledger was.
