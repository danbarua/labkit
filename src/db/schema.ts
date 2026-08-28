import * as p from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Single source of truth for the schema LabKit's own vanilla SQL objects
 * (the `tenants` table, the natural-id sequences/functions in
 * drizzle/0002_natural_ids.sql) live in — hardcoded to Postgres's default
 * `public` for now, named in exactly one place so every raw-SQL call site
 * (src/db/tenant.ts, src/db/graph.ts) can schema-qualify explicitly instead
 * of relying on session `search_path` ordering. That ordering already
 * produced one real surprise: unqualified `CREATE FUNCTION` statements in
 * 0002 land in `ag_catalog` (not `public`), because migration 0001's `SET
 * search_path = ag_catalog, "$user", public` is still the active session
 * setting when 0002 runs — confirmed via `pg_proc`/`pg_namespace`. If
 * LabKit ever needs more relational tables per tenant (schema-per-tenancy,
 * as opposed to today's single shared `public.tenants`), this is the one
 * constant that would change.
 *
 * NOT applied to the `tenants` table declaration below via `pgSchema()` —
 * drizzle-orm hard-rejects `pgSchema("public")` at runtime ("If you want to
 * use 'public' schema, just use pgTable() instead"), so `tenants` stays a
 * plain `pgTable()`. This constant exists for the raw-SQL call sites, which
 * aren't subject to that restriction.
 */
export const LABKIT_SCHEMA = "public";

/**
 * `tenants` is the only core domain entity that is genuinely relational: it
 * never appears as an edge endpoint in the LabKit graph of interest
 * (docs/project-journal/001_git_init.md) and none of the MVP acceptance
 * queries traverse through it. It's the persistence/isolation boundary, not
 * a scientific entity — see docs/project-journal/003_review_domain_tenancy.md
 * for why this is `Tenant`, not `Project` (a repository/workspace concept,
 * mutable and orthogonal to tenant identity), and
 * docs/project-journal/004_tenancy_implementation_plan.md for the rest of
 * the tenancy design.
 *
 * Every core domain entity (Question, LineOfEnquiry, EvidenceUnit, Evidence,
 * Claim, Decision, Criterion, CriterionEvaluation, Gate, Review, Artefact,
 * Computation, Task) is a node in this tenant's own Apache AGE graph — one
 * graph per tenant, not one global graph with a repeated `tenant_id`
 * property. See src/db/tenant.ts for graph provisioning, src/db/graph.ts
 * for the `TenantGraph` query/mutation surface, tests/domain-graph.test.ts
 * for the acceptance-criteria traversals, and ./drizzle/ for the migrations
 * (drizzle-kit-generated for this table, hand-written `--custom` for the
 * one-time AGE extension bootstrap and the global natural-id machinery,
 * applied together via src/db/migrate.ts's runMigrations()).
 */
export const tenants = p.pgTable("tenants", {
  id: p.serial().primaryKey(),
  // User-facing short name (e.g. "labkit"). NEVER used to derive
  // graph_name directly — a user-controlled string must not become an AGE
  // graph identifier (PJ-003 §5).
  slug: p.text().notNull().unique(),
  display_name: p.text().notNull(),
  // Single source of truth: derived from the trusted internal `id`, not a
  // second value an application could accidentally desync from it.
  // "labkit_t1", not "labkit_t<uuid>" — boring, hyphen-free, debuggable.
  graph_name: p.text().notNull().generatedAlwaysAs(sql`'labkit_t' || id`),
  created_at: p.timestamp().defaultNow().notNull(),
});

export type Tenant = typeof tenants.$inferSelect;

/**
 * The role LabKit's own queries run as, and what it is honestly worth.
 *
 * **A safety boundary, not a security one.** A session `SET ROLE`s down to this
 * from the superuser it connected as, and can `RESET ROLE` back — so it stops a
 * query that *forgot its tenant filter*, which is the failure this exists for,
 * and stops nothing at all from a caller who means harm. Say that plainly
 * rather than let a reader infer more from the word "policy" than is there.
 *
 * **It has to be `SET ROLE` and cannot be a login role**, and that was measured
 * rather than chosen (2026-08-26). `LOAD 'age'` is refused to a non-superuser —
 * `access to library "age" is not allowed`, SQLSTATE 42501 — and without the
 * library loaded the `agtype` type does not resolve, so *every Cypher query
 * fails*, reads included. Connecting as a superuser and stepping down after
 * `bootstrapSession` keeps the library loaded for the session, which is why the
 * arrangement works at all; it is also identical on PGlite, which has no login
 * roles and is always superuser.
 *
 * A real deployment wanting a genuine login boundary would need
 * `ALTER ROLE labkit_app SET session_preload_libraries = 'age'` so the library
 * arrives without a `LOAD`. Noted, not built, not measured.
 *
 * The name is a constant because three places need it and only one of them is
 * a drizzle declaration: `src/db/scoped.ts` issues the `SET ROLE`, and
 * `src/db/provisioning.ts` grants to it on every tenant resolve. This file is a
 * leaf of `src/db/`, which is why it holds the name — putting it beside the
 * `SET ROLE` made the layer cyclic.
 *
 * **`.existing()` is what says "declared here, created elsewhere"**, and it is
 * the whole reason the RLS migration is generated rather than hand-edited.
 * `generatePgSnapshot` skips any role marked that way (`if (!role._existing)`),
 * so the generated file names the role in its policy and never emits a
 * `CREATE ROLE` for it. `drizzle/0002_natural_ids.sql` creates it instead,
 * guarded, because a role is cluster-scoped while drizzle's ledger is
 * per-database.
 *
 * Two wrong answers preceded this one, both worth keeping because both look
 * right:
 *
 * - `pgRole(name, { createRole: false })` does **not** mean "do not create it".
 *   `createRole` is the Postgres `CREATEROLE` *attribute* —
 *   may-this-role-create-other-roles — beside `createDb` and `inherit`.
 * - `entities.roles.exclude` in `drizzle.config.ts` does **not** apply here
 *   either. Read in drizzle-kit 0.30.6's bundle: `prepareRoles`' `excludeRoles`
 *   is consumed only by `fromDatabase`, the *introspection* path.
 *   `generatePgSnapshot` takes no config at all, so exclusion cannot reach a
 *   schema-file generate.
 *
 * The first misreading is what produced a hand-edited generated migration.
 */
export const APP_ROLE = "labkit_app";

/** The declaration `drizzle-kit` reads, over the name above. */
export const labkitApp = p.pgRole(APP_ROLE).existing();

/**
 * The durable event log — **the second LabKit-owned relational table**, and the
 * first that is per-tenant data rather than the tenancy boundary itself.
 *
 * `src/domain/events.ts` explains what an event is and why the seam exists.
 * What this table adds is durability, and the consumer that earned it:
 * attribution has ridden on every event since PJ-031 and nothing could read it,
 * because the sink died with the process.
 *
 * **`tenant_id` is here because `tenants` is shared.** A tenant's *graph* is its
 * own Postgres schema, so nothing in the graph needs to say which tenant it
 * belongs to. The relational side has no such boundary — `public.tenants` is one
 * table for everyone — and this is the first place that difference has to be
 * paid for. Every read filters on it.
 */
export const labkitEvents = p
  .pgTable(
    "labkit_event",
    {
      /**
       * The stream's order, and the reason it is a sequence rather than `at`.
       *
       * Most of the suite runs a frozen clock, so every event in a scenario
       * shares one instant and `at` cannot order any two of them. This always
       * can. `src/domain/events.ts` rejects natural-id allocation order for
       * ordering on the grounds that it is "an accident of the sequence and not a
       * modelled fact" — a sequence *on the event table* is exactly that modelled
       * fact, which is the distinction worth holding on to.
       */
      seq: p.bigserial({ mode: "number" }).primaryKey(),
      tenant_id: p
        .integer()
        .notNull()
        .references(() => tenants.id),
      /**
       * Verbatim what the `Clock` said — text, not `timestamptz`.
       *
       * A `timestamptz` round-trip normalises precision, turning
       * `2026-08-18T12:00:00Z` into `...T12:00:00.000Z`. The suite has clocks of
       * both shapes and assertions on the exact strings, and an event log that
       * quietly rewrites what it was told is the wrong thing for a record whose
       * whole job is fidelity. Ordering does not depend on it — `seq` does.
       */
      at: p.text().notNull(),
      operation: p.text().notNull(),
      /**
       * The natural id of what the operation was primarily about.
       *
       * **Not necessarily what the operation created** — see `created`. Six verbs
       * mint a `Decision` and only one of them names that decision here.
       */
      subject: p.text().notNull(),
      /**
       * Every handle this act minted.
       *
       * `subject` answers *what was this about*; this answers *what came into
       * existence*, and they are different for most verbs. Without it, asking
       * "which act created this record?" would silently miss four of the six
       * verbs that mint a Decision.
       *
       * A real array, GIN-indexed, so the question is `created @> ARRAY[$id]` —
       * one indexed predicate on one table, no join. Native agtype/Postgres
       * arrays are used elsewhere for the same reason (`Task.mayRead`,
       * `CONSUMES.positions`).
       */
      created: p.text().array().notNull().default([]),
      attribution_label: p.text().notNull(),
      attribution_id: p.text().notNull(),
      /**
       * How LabKit came by the name beside it — `observed`, `claimed` or
       * `unattributed`. See `AttributionHow` in `src/domain/events.ts` for what
       * each means and why there are three.
       *
       * **Nullable, and `null` is the one thing this column says that the enum
       * cannot.** A row written before 2026-08-28 has an actor and no recorded
       * grade, and every alternative to `null` asserts something false about
       * it: a default of `claimed` invents an assertion nobody made, and
       * `unattributed` contradicts the populated name sitting next to it. So
       * `null` means **recorded before LabKit knew how it knew** — a value the
       * migration itself produces, which is what keeps it from being a state
       * with no writer.
       *
       * The write side cannot reach it: `AttributionContext.attribution_how` is
       * required, so a writer that omitted the grade would not compile. Only
       * history is null, and only ever history.
       */
      attribution_how: p.text(),
      git_hash: p.text().notNull(),
      detail: p.jsonb(),
    },
    (t) => [
      // The stream, per tenant. Every read is tenant-scoped, so every index is.
      p.index("labkit_event_tenant_seq_idx").on(t.tenant_id, t.seq),
      // "What happened to this record" -- the only lookup keyed by a handle.
      p.index("labkit_event_tenant_subject_idx").on(t.tenant_id, t.subject),
      // "What has this agent been doing", in order.
      p.index("labkit_event_tenant_agent_idx").on(t.tenant_id, t.attribution_id, t.seq),
      /**
       * Rows belong to the tenant the session is scoped to, and to no other.
       *
       * **`current_setting` without `missing_ok`, deliberately.** A scoped session
       * that never had its tenant set makes every query on this table raise
       * `unrecognized configuration parameter` (42704) — loud, at the first read.
       * The alternative, `current_setting('labkit.tenant_id', true)`, returns NULL
       * and the policy then matches nothing, so the log reports that nothing has
       * ever happened against a full table. This repo's rule is that a confidently
       * wrong answer is worse than a refusal; an empty event log is exactly the
       * confidently wrong answer `src/cli/session.ts` already has a paragraph
       * about.
       *
       * `WITH CHECK` as well as `USING`: without it a scoped session could write
       * a row it would then be unable to read. Measured refusing a cross-tenant
       * insert with 42501.
       *
       * `tenants` gets no policy — it has to be read to resolve a slug *before*
       * the tenant is known, which is the boundary this whole scheme starts at.
       */
      p.pgPolicy("labkit_event_tenant_isolation", {
        as: "permissive",
        for: "all",
        to: labkitApp,
        using: sql`tenant_id = current_setting('labkit.tenant_id')::int`,
        withCheck: sql`tenant_id = current_setting('labkit.tenant_id')::int`,
      }),
    ],
  )
  .enableRLS();

export type LabkitEvent = typeof labkitEvents.$inferSelect;
