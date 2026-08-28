# 058: the Postgres arm moves off every PR

**Session wrap, 2026-08-28, on `ci/pg-on-db-changes`.** Not a decision record —
the reasoning for the split is in `cloudbuild.pg.yaml` and `infra/ci/triggers.tf`,
which argue it where it will be read.

**The range is far wider than this session.** The baseline is `f462fcd` and
thirteen commits sit between it and HEAD; **only `3e3f1e3` is this session's.**
The other twelve are peer merges (#41 through #72), several with their own
entries — 056 and 057 among them. This session was a **cold review** session and
most of what it did left no commit at all; see Open.

## Goal

Dan's: stop paying `test:pg` on every pull request, since nothing deploys to
Postgres yet and it is ~153s of a ~394s build.

## Changed

**`3e3f1e3` — ci: test:pg on persistence changes and on merge, not on every PR.**
Open as **PR #73**.

- `cloudbuild.pg.yaml` — new; `ci-image`, `postgres`, `install`, `test-pg`. It
  installs for itself, having no `check` step to share a workspace with.
- `cloudbuild.test.yaml` — down to `ci-image` and `check`.
- `infra/ci/triggers.tf` — `pg-on-pr` (allowlist: `src/db/**`, `drizzle/**`,
  `docker/postgres/**`, the build file, the script) and `pg-on-main` (push,
  unfiltered).
- `CLAUDE.md` — two claims retired, quoted rather than deleted.

Working tree is clean; the branch is pushed and rebased onto `47894ba`.

## Verified

- `bun run check` — **18/18 green**, `bun test` 58.2s.
- `terraform validate` — *"Success! The configuration is valid."*
  `terraform fmt -check` — clean, exit 0.
- Both YAML files parse; step split confirmed by reading the ids back out.
- **The claim the change rests on was measured, not assumed**: the suite has
  exactly one `skipIf` (`tests/connection-lock.test.ts`) and it skips *on*
  Postgres; `tests/tenancy-isolation.test.ts` runs on both backends. So no test
  requires a real Postgres.

**Not run: either trigger.** The predicted ~230s PR build is a prediction and
says so in the file. `terraform apply` is Dan's.

## Open

**The prediction in `cloudbuild.test.yaml` needs replacing with a measurement**
after the first green run — it is labelled, so it is not a stale number yet, but
it becomes one.

**Two review findings of this session are on PRs, not in the repo**, and neither
is closed by anything here: PR #69's selection-divergence comment (half of which
I later retracted, with the correction posted on the same PR), and PR #72's
`byCriterion` finding, which was fixed and independently re-verified at
`231ee74` — four cells, one variable, `challenges + passed` now `established`.

**Most of this session produced no commits at all**, which is worth saying to
whoever reads this range and finds one. It reviewed PRs #69 and #72, audited
CLAUDE.md, audited PJ-008 §3 and found three domain questions tracked nowhere
(now rows AH/AI/AJ, added by a peer), and carried findings between this repo and
`exo-ledger`. That traffic is in PR comments and cross-session messages, and it
is not in the record — which is the thing LabKit exists to fix.

## Next

`terraform apply` in `infra/ci`, then merge #73 and read the first `pg-on-pr`
build to replace the predicted timing. The trigger will not fire on #73 itself
— it touches no `src/db/**` — so the first real exercise is `pg-on-main` on the
merge.
