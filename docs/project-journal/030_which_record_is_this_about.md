# 030 — Which record is this answer about?

**2026-08-23.** A scenario, a diagnosis, and no decision yet. The scenario is
written here because PJ-008's corpus is closed and this one did not come from
it — it came from exposing the whole domain over MCP, where every handle is a
bare string and nothing can be passed by accident.

## 1. The scenario

**Story.** One question, two approaches running in parallel. One reports; the
other has not.

> **Researcher:** We've got two teams on whether depth moves convergence — Ana's
> running the seed sweep, Bruno's doing the ablation.
>
> *(later)*
>
> **Agent:** The seed sweep is conclusive. Depth moves convergence, about three
> steps, consistent across five seeds.
> **Researcher:** Good, close it out.
>
> *(next morning)*
>
> **Bruno:** Where's my ablation up to?
> **LabKit:** *?*

**Afterward — LabKit must answer:**

- *Where is Bruno's ablation up to?* → **not** "answered". Nothing has been
  recorded against it. Today LabKit says it is answered, and offers Ana's
  evidence as its own.
- *Is the question still open?* → no. It was answered, by the seed sweep.
- *Should Bruno keep going?* → LabKit must not decide this. Independent
  corroboration of an answered question is legitimate work; so is stopping. The
  record says the question is answered and the ablation has reported nothing,
  and Bruno chooses.
- *What did the answer rest on?* → the seed sweep. Not "the seed sweep and the
  ablation".

**Where it sits.** S-1's fourth Afterward already builds the setup — two
pursuits of one question stay one question, `pursuitsOf` returns both, `known`
lists the question once — and stops one step before either closes.

## 2. The diagnosis

Not a bug. `closeEnquiry()` writes `Decision -RESOLVES-> Question` and
`enquiryStatus()` derives closure from the question, both deliberately and both
recorded as such: closure attaches to the question a line of enquiry pursues,
not to the line. That was true while one question had one pursuit. `pursue`
makes it false.

Stated as identity, which is where Dan took it and where it belongs: **a
reference denotes one record while the answer is about another.**

| reference | the id denotes | what the verb takes it to mean |
| --- | --- | --- |
| `EnquiryRef` into `enquiryStatus` | a line of enquiry | the **question** it pursues |
| `ObservationsRef` | an artefact of either kind | "observations", asserted by `kind` |
| `AnalysisRef` as an input | a computation | that computation's **output artefact** |

This is *identity is never wording* arriving in a seventh region, asked from the
other end. The six previous instances all asked **are these two records the
same one?** This asks **which record is this answer about?** Same failure
either way: something identified by one thing and answered by another.

`tests/subject-identity.test.ts` demonstrates all three in one file. It asserts
what the model does today **including where that is wrong** — a green run means
the ambiguities are still present, not that they are acceptable, and fixing
row 1 turns the file red on purpose.

## 3. What the scenario decides, and what it does not

Writing the conversation out ruled out both options first put to Dan. Both
assumed `enquiryStatus` reports *one* state, and the conversation says Bruno
needs **two facts**: the question is answered, and his line has produced
nothing. Collapsing them is what produces the wrong answer — the same shape as
S-1 refusing to collapse `untested` into `unresolved`.

So the likely direction is that `enquiryStatus(enquiry)` should answer about the
enquiry, and *"has this question been answered?"* is a different read taking a
`QuestionRef`. That is a guess from one conversation and is **not decided**.
Whether two verbs earn their place where one stands needs the third bar: a
reader. Bruno is that reader if the conversation is right, and one conversation
is not a corpus.

**One diagnosis does not imply one remedy.** CLAUDE.md records four scenarios
asking *does the act record what it produced?* which needed four different
fixes. Rows 2 and 3 above may go the same way: the `AnalysisRef` dereference is
convenient and writes the correct edge, and making it honest would mean callers
naming artefacts they do not hold.

## 4. What is already known to cost something

Row 1 gives a **confidently incorrect answer** — a line of enquiry nobody worked
on reporting itself answered with another line's evidence. That clears PJ-011
§5 without a further probe.

Rows 2 and 3 do not, *inside the process*. Passing an analysis's output artefact
id as an `ObservationsRef` produces an identical record. But that equivalence
was measured holding an artefact id the domain handed back, and **a consumer
over the wire does not have one**: `replace_analysis(supersedes=A2,
from=[A1])` fails with `CONSUMES does not allow Computation -> Computation`.
The workaround exists — the id surfaces in `whySupported().restingOn` — by
asking why a claim is supported in order to learn what a computation read.

That correction came from an external review of PR #2 (ChatGPT), which caught
that the equivalence had been checked at the wrong boundary. Right check, wrong
side of the adapter.
