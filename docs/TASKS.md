# Outstanding work

**A queue, not a record.** Only actionable items live here — a finished item is
**deleted**, not struck through; git history is the record. What the model knows
lives in PJ-008 §3's index table; standing facts and gates live in CLAUDE.md.
Neither is restated here — see CLAUDE.md, "The one rule about documents".

---

## CI on Google Cloud Build

The `agent-bus` repo already has this working; the LabKit side is adapting it
to TypeScript/Bun. `terraform apply` in that repo's `infra/ci` is Dan's to run.

- **Read `~/Code/agents/agent-bus/infra/ci`** — `triggers.tf`,
  `service_accounts.tf`, `secrets.tf`, `apis.tf`, and its `README.md`.
- **Read that repo's `cloudbuild.yaml`, `cloudbuild.test.yaml`,
  `cloudbuild.e2e.yaml`, `cloudbuild.image.yaml`, `docker-compose.cloud.yml`
  and `docker-entrypoint.sh`** — four build files split by what they run, which
  is the shape to copy.
- **Adapt for Bun.** No Python image, no `pip`. `oven/bun` plus
  `docker/postgres/` for the Postgres arm.
- **Decide what runs per PR rather than per commit**: `bun run check`,
  `bun run test:pg` (needs the container), and anything slow enough that nobody
  runs it locally. `test:pg` is the one with no watcher at all today — no CI, no
  hook, and `bun run check` excludes it deliberately.
- **`docker/postgres/` is the Postgres arm's image** and already exists. A
  second image for the build itself is a separate question.

## Documents

- **Read `~/Code/agents/agent-bus/AGENTS.md`** — its pinned DX Principles
  header, and how it keeps itself from rotting (the Entropy-Safe Prose rule:
  check the tense; a sentence about how the code *is* goes stale, one about what
  *changed* does not).
- **Draft a pinned DX Principles header for this repo's `CLAUDE.md`.** Same
  shape: rules earned by something going wrong here, each with its tell.
  LabKit has the material — a barrel nothing imported through, a check
  satisfiable only by hand-editing generated SQL, four documents asserting a
  wrong cause for one flake.
- **Sweep `CLAUDE.md` for stale prose.** It is long and parts of it describe a
  system two refactors ago. Retire rather than revise where the code now says
  it; the file's own rule is that state belongs in exactly one place.
- **`docs/persistence-spikes.md` -> `docs/persistence.md`.** It is dated AGE
  findings from 2026-08-17/18 and reads as a lab notebook. What a reader needs
  is a concise explainer of how persistence works now — two backends, one seam,
  a lock, migrations, tenancy. Keep the dated probes that still bite; drop what
  the code has since answered.

## Loose ends from the DB layer work

Each is small and none is blocking.

- **`provisionTenantGraph()` still opens its own transaction** with raw
  `BEGIN`/`COMMIT` rather than `src/db/transactor.ts`. It is admin DDL that runs
  before the application pipeline exists, so it has nothing to join — but it is
  the one boundary left outside the transactor.
- **Nothing checks that a relational call site uses `unwrapped()`.** Drizzle
  offers no hook, so it is convention, and forgetting it leaks bound parameters
  into an error message that reaches an MCP client. Either a `check:` script or
  a reason it does not need one.
- **A real login-role boundary is available and unbuilt.** A server that
  preloads AGE (ours does) plus a `bootstrapSession` that does not issue `LOAD`
  gives a security boundary where `SET ROLE` gives only a safety one. The read
  half is measured; the write half is not. See `src/db/scoped.ts`.
- **Drizzle v1** is release-candidate and we wait for the release. When it
  lands: `.enableRLS()` becomes `pgTable.withRLS()`, and the surfaces most
  likely to break are `src/db/migrate.ts` (it casts through private
  `dialect`/`session` fields) and `src/db/orm.ts` (it depends on `pg-proxy`'s
  callback shape). `drizzle-kit` has a smaller upgrade available independently.

## Deliberately not being done

Here so nobody re-discovers them as gaps.

- **Bitemporality.** Record-time versus belief-time is real and unrepresentable,
  and no source obligation requires it. `Decision.decided_at` is record time.
- **An instant on `EvidenceUnit`.** Would let `whatWasKnown()` split `open` into
  worked-on and untouched. Nothing has needed it.
