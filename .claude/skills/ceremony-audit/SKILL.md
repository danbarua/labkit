You are auditing a codebase and its guidance for CEREMONY.

Ceremony is a rule or refusal that was correct while the team was
testing whether a model was right, and is still enforced now that they
are building something people use.

Validation-era question: “Is this model wrong? Can we justify this
from evidence we already have?”
Product-era question: “Can someone do their job? Can they record what
happened to them?”

FLAG something when it is a standing constraint whose REASON is about
proving, not about the user.

Tells (any two is enough; three is a lock):

1. ERA
   Nearby text talks about bars, probes, scenario corpora, designer
   rounds, “that era closed”, “not product constraints”, PJ-nnn
   validation — and the rule is still written in the present tense as
   what we do.

2. PROVING REASON, not USE REASON
   Justification sounds like:
   - “no reader needs it yet”
   - “that would be inventing API to satisfy a test”
   - “stored shape is expensive to change”
   - “queries are free to be wrong and re-run”
   - “a fact earns its place when a second consumer appears”
   - “don’t materialise until demonstrated”
   Individually these can be true. Flag them when they are used to
   refuse a thing a researcher or operator already has in hand
   (a stated relationship, a flag, a status, a field they can set).

3. HIDES AS RIGOUR
   The prose reads as restraint, evidence, not-overbuilding. Restate
   the same restriction plainly as “the app will not do X for the
   user.” If that plain version would fail review, the dressed version
   is ceremony.

4. ARTIFACTS LEFT BEHIND
   Look for:
   - a guard for a state nothing can produce
   - a relationship the caller stated, dropped because no query
     wanted it yet
   - a field the app refuses to write (readers exist, writer does not,
     or the reverse justified by “computed, so must not be stored”)
   - docs that still enforce the rule after the experiment ended
   - a new bolded principle added in the same commit that deleted
     the old validation rules (replacement commandment)

5. ORIGIN
   git log -S / blame: introduced while retiring bars, rewriting
   CLAUDE.md, summarising a probe, or “tidying constraints.”
   Owner does not recognise it as a feature they wanted.

DO NOT FLAG:
- Owner-stated product decisions in their own words.
- Soft notes that immediately allow the opposite (“compose one
  anyway; nothing is lost”).
- Accurate descriptions of current implementation that do not
  forbid a future store/write/verb.
- Real defects that still need a second reader for a *query
  shape*, when the text does not ban storing the fact.

OUTPUT:
For each hit:
- Location
- The rule in one sentence
- The proving-reason (quote)
- The use-reason that is missing (“a researcher cannot …”)
- Introduced-in commit if findable
- What to remove vs what local fact can stay as a design note
- Plain restatement that should have been rejected: “the app won’t …”

Do not replace a deleted ceremony rule with a new general principle.
If the local design is still right (e.g. gate state is computed),
leave the implementation; kill only the commandment.