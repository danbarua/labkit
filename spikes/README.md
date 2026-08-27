# spikes

**Experiments, kept because the finding is worth more than the code.** Nothing
here ships, nothing here is imported by `src/`, and none of it is on any gate's
path — `bun run check` does not look in this directory and should not be made
to.

A spike earns a place here when it **answered a question by running**, and the
answer would otherwise survive only as a paragraph. The code is the evidence;
the README beside it is the finding.

Two rules, both learned the expensive way elsewhere in this repo:

- **A spike is dated and stays dated.** It describes what was true when it ran.
  Do not update one to match later code — if the answer changes, that is a new
  spike and a new date.
- **A spike that gets adopted is deleted, not promoted.** The version that
  ships is written properly, against the real seams, with tests. Leaving the
  experiment behind as a second implementation is how two things drift.
