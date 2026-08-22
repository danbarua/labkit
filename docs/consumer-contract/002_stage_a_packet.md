# Stage A packet — the only material designers receive first

**This file is the complete Stage A input.** Everything a designer sees is
below the line. Nothing else is provided: no repository access, no journal
entries, no acceptance questions, no design principles, no knowledge that other
designers exist.

Assembled 2026-08-20. The boundary statement is **written fresh for this
packet** rather than extracted from `001_git_init.md`, because that entry's
equivalent section enumerates runs, configs, metrics, artifacts and lineage
graphs — supplying the decomposition the probe is meant to elicit, even while
describing it as another tool's territory.

The eighteen statements are the **bold sentences only**, verbatim. Their glosses
are stripped and §1's closing "The shape these describe" is excluded, because
both leak the model: story 9's gloss names `Artefact`/`Evidence`/`Question`/
`Decision` and `RecoveredArtefact` outright, story 12's argues for "Evidence and
Claim being separate objects", and the closing section gives a process diagram
in the ontology's own terms. The bold sentences themselves contain no such term.

---

## What LabKit is for

LabKit records how a research process reasons: why a piece of work was done,
what came of it, what the research now believes as a result, what those beliefs
depend on, and what is still unsettled.

It is **not** a system for recording metrics, run logs, parameter sweeps or
performance dashboards. Tools for that exist and LabKit assumes one is in use
alongside it. A question about how a job performed is out of scope. A question
about what the research currently holds to be true, and why, is in scope.

Assume a programme carried out over months by a mix of people and software
agents, where the eventual shape of the work is not known when it starts, and
where the record must survive people forgetting, disagreeing, and being wrong.

## What researchers say they want

1. As a researcher, I want to turn a vague observation into progressively sharper questions without pretending I knew the final experiment structure in advance.
2. As a researcher, I want a positive result on a weaker proposition to coexist with an unresolved stronger proposition.
3. As a researcher, I want a formally significant computation to remain insufficient evidence when its own prespecified robustness conditions fail.
4. As a researcher, I want a well-supported negative answer to close a line of enquiry without marking the research programme as failed.
5. As a researcher, I want to ask whether two findings genuinely conflict, and have the system trace the distinct questions, evidence and claim scopes before answering.
6. As a researcher, I want review to alter questions, criteria and interpretation freely before confirmatory evidence exists, while retaining why those changes were made.
7. As a researcher, I want to repair a locked experimental procedure when feasibility exposes a mechanical defect, without silently mutating history or turning every amendment into scientific p-hacking.
8. As a researcher, I want expensive or information-sensitive experiments to advance through cheap feasibility steps, with promotion determined by explicit evidence rather than agent enthusiasm.
9. As a researcher, I want reconstruction attempts to distinguish exact recovery, approximate recovery and unresolved historical provenance.
10. As a researcher, I want the system to distinguish reproduction of a conclusion from reproduction of an exact execution.
11. As a researcher, I want to invalidate an analysis without automatically invalidating the underlying observations, and see exactly which downstream claims need reconsideration.
12. As a researcher, I want claims to be revisable independently of the computations and artefacts from which they were inferred.
13. As a researcher, I want surprising follow-up questions spawned by a completed experiment to become new work rather than silently widening the scope of the completed study.
14. As a researcher, I want an unresolved question to be deliberately accepted as unresolved, without creating an eternal queue of fake work required merely to make everything green.
15. As a researcher, I want a candidate optimized implementation to coexist with a trusted reference and be promoted only when the required equivalence evidence exists.
16. As a researcher, I want "same science, new machinery" and "new execution of the science" to have different correctness criteria.
17. As a researcher, I want a gate's status to depend on evidence that its criterion was actually evaluated, not on the presence of something named "gate."
18. As a researcher, I want low-friction exploration to be captured without making ephemeral scratch part of the scientific record by accident.

## Your task

Design the **read surface** such a system should offer — the operations a
researcher, or an agent working on their behalf, would call to find out where
the research stands. Read-only throughout: nothing that records, changes or
approves anything.

Produce three things.

**1. The read operations.** For each: its name, what the caller passes, what
comes back, and which of the statements above it serves. Use whatever language
you would want a researcher to read. Do not design a storage or query interface:
if an operation is described in terms of how the data is held or navigated
rather than what the researcher wants to know, restate it as the question they
actually asked.

**2. Questions you expect to be refused.** Where a system like this would have
to say "I cannot answer that", and what you would want it to say instead of a
blank. Do not soften a question because it sounds hard to support; one that
seems unanswerable is worth more written down than dropped.

**3. A glossary of every concept your operations rely on** — all of them,
whether the material above named it or you introduced it. For each concept:

- **Definition** — one or two sentences.
- **Which read operations require it.**
- **What identity must persist** — how you would tell two of these apart, and
  what makes one of them still "the same one" a year later.
- **What must be remembered** about it, as opposed to worked out on demand.
- **What can be derived** rather than stored.
- **What two situations would become indistinguishable** if this concept were
  absent from the record — state both situations concretely.

The last bullet is the one to labour over. A concept whose absence loses no
distinction is decoration; write that down honestly if it applies to something
you have listed.
