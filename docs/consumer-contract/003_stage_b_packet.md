# Stage B packet — revealed only after Stage A outputs are frozen

**Do not show this to a designer until their Stage A output is committed.** The
whole value of the two-stage split is knowing which concepts a designer reached
on their own and which appeared only once LabKit's existing design language was
supplied. Reveal it early and that measurement is gone permanently.

Stage B material is `docs/project-journal/001_git_init.md` **lines 407–448**,
reproduced verbatim below: the acceptance questions, the should/should-not list,
and the design principles.

It is held back rather than shared at Stage A because it is considerably more
model-aware than it looks. It names claim, decision, criterion, line of enquiry,
evidence, computation and artefact, and then states which relationships among
them matter — why each exists, what it depends on, what invalidates or reopens
it. That is most of the conceptual decomposition, handed over. It also contains
the phrase *"make it cheap to ask … 'what changed?'"*, which alone would make
any Stage A convergence on temporal survey worthless as evidence.

---

## The constraints

> ## MVP Acceptance Criteria
>
> LabKit should be able to answer the following example questions:
>
> - "Show me the evidence supporting Claim C7, the computations that generated it, and the relevant run metrics."
> - "Why does Claim C7 currently count as supported?"
> - "If Artefact A12 is invalidated, what claims, decisions, and open lines of enquiry become affected?"
> - "Why is this line of enquiry still open?"
>
> ### What this is and isn't about
>
> - **Is about:** provenance, justification, dependency propagation, and research state
> - **Is not:** metrics and run telemetry
>
> ### What this should and should not do
>
> - **Should:** make research state explicit enough that agents can work safely in uncertain or weakly specified scientific domains.
> - **Should:** preserve why a claim, decision, criterion, or line of enquiry exists, what evidence it depends on, and what would invalidate or reopen it.
> - **Should:** make dependencies and consequences traversable, so invalidating an artefact or evidence item propagates to affected claims, decisions, and open questions.
> - **Should:** separate scientific state from execution telemetry, while allowing computations and external run systems to be linked into the research record.
> - **Should:** allow exploratory work, failed attempts, amendments, and partial findings without forcing them prematurely into a confirmatory structure.
> - **Should:** support formal constraints where they protect a real scientific boundary, such as test-set access, prerequisite evidence, or a promotion criterion.
> - **Should:** reduce the amount of global context an implementation agent must understand by presenting it with a narrow, derived task contract.
> - **Should:** make it cheap to ask "why?", "what depends on this?", "what remains unresolved?", and "what changed?".
> - **Should:** prefer recording evidence and relationships over inventing process machinery around them.
> - **Should:** permit the research process to evolve without erasing the history of earlier decisions or the evidence available when they were made.
> - **Should not:** become an experiment tracker, metrics store, dashboard system, or replacement for W&B/MLflow.
> - **Should not:** require implementation agents to understand or manually maintain the full research ontology.
> - **Should not:** turn every line of enquiry, diagnostic, or implementation detail into a mandatory gate.
> - **Should not:** confuse absence of evidence with failure, or a missing evaluation with a pass.
> - **Should not:** treat exploratory observations as confirmatory evidence merely because they exist in the graph.
> - **Should not:** make operational entities such as tasks, agents, or runs part of the logical support for a scientific claim.
> - **Should not:** prevent work simply because the eventual scientific structure is not yet fully known.
> - **Should not:** freeze incidental implementation choices that do not affect scientific interpretation.
> - **Should not:** require duplicated bookkeeping across LabKit and external execution systems.
> - **Should not:** accumulate ceremony merely because a previous project once encountered a particular failure mode.
>
> ## Design Principles
>
> - LabKit is formal where state and consequences matter; permissive where discovery is still happening.
> - A missing structure should be tolerated when the science is genuinely unresolved. A missing dependency, criterion evaluation, or provenance link should not be silently interpreted as satisfied.

## The Stage B question

> These are constraints the system's authors wrote down. Does any of it make you
> revise the contract you produced? For each revision: what changed, which
> constraint caused it, and whether it added a concept to your glossary, removed
> one, or split one in two.
>
> If nothing changes, say so — that is a legitimate answer and more useful than
> a manufactured revision.

Record revisions as a **separate document** from the Stage A output. The Stage A
output is never edited after freezing.
