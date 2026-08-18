-- Custom migration: JIRA-style natural/display IDs (e.g. "COMP-123") for
-- every graph node, plus the CQRS read-side views that project them.
--
-- Scoping decision (2026-08-17): natural IDs are GLOBAL per entity-type —
-- one native Postgres SEQUENCE per label, unique across all projects. Not
-- scoped per-project.
--
-- Verified empirically against pglite-age before being written here (see
-- docs/project-journal/002_schema_dot_ts.md and the postgres-age skill):
--   * A `LANGUAGE sql` scalar function CAN be called from inside a Cypher
--     CREATE property map, but only when the literal arguments are
--     explicitly cast (`'question'::text`) — AGE otherwise types Cypher
--     string literals as `agtype` and no `(agtype, agtype)` overload exists.
--   * The properties column on a label's underlying table round-trips
--     through `(properties::text)::jsonb` cleanly with ordinary jsonb `->>`,
--     with none of `parseAgtype()`'s `::vertex`/`::edge`-suffix stripping
--     needed — that suffix only appears on a full vertex/edge composite
--     returned by `cypher()`, not on a bare `properties` column read directly
--     off the label's table.
--   * `ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)`
--     can be the target of a real Postgres UNIQUE index, and Postgres
--     enforces it (confirmed: a duplicate natural_id via Cypher SET raises a
--     genuine `duplicate key value violates unique constraint` error) — so
--     natural_id uniqueness is DB-enforced, not just an assumption resting
--     on nextval()'s atomicity.

CREATE SEQUENCE IF NOT EXISTS labkit_question_natural_id_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS labkit_lineofenquiry_natural_id_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS labkit_evidenceunit_natural_id_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS labkit_evidence_natural_id_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS labkit_claim_natural_id_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS labkit_decision_natural_id_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS labkit_criterion_natural_id_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS labkit_criterionevaluation_natural_id_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS labkit_gate_natural_id_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS labkit_review_natural_id_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS labkit_artefact_natural_id_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS labkit_computation_natural_id_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS labkit_task_natural_id_seq;
--> statement-breakpoint

-- Generic generator: one function instead of thirteen near-identical ones.
-- `label` must be the lowercased NodeLabel (matches the sequence names
-- above); `prefix` is the short display prefix from graph.ts's
-- NATURAL_ID_PREFIX. Both args are always literals supplied by graph.ts,
-- never caller/user input.
CREATE OR REPLACE FUNCTION labkit_next_natural_id(label text, prefix text)
RETURNS text
LANGUAGE sql
AS $$
  SELECT prefix || '-' || nextval('labkit_' || lower(label) || '_natural_id_seq')::text;
$$;
--> statement-breakpoint

-- Small extraction helper so the 13 views below don't each repeat the
-- agtype -> jsonb round-trip. Returns NULL for a key the node doesn't have
-- (matches the optional-property semantics already in graph.ts's *Props
-- interfaces).
CREATE OR REPLACE FUNCTION labkit_prop(properties agtype, key text)
RETURNS text
LANGUAGE sql
AS $$
  SELECT (properties::text)::jsonb ->> key;
$$;
--> statement-breakpoint

-- One UNIQUE functional index per label — the DB-enforced half of natural
-- id integrity (nextval() already guarantees no collisions from the
-- generator itself; this guards against anything ever hand-setting
-- natural_id directly via Cypher SET).
CREATE UNIQUE INDEX IF NOT EXISTS question_natural_id_idx ON labkit."Question" ((ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS lineofenquiry_natural_id_idx ON labkit."LineOfEnquiry" ((ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS evidenceunit_natural_id_idx ON labkit."EvidenceUnit" ((ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS evidence_natural_id_idx ON labkit."Evidence" ((ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS claim_natural_id_idx ON labkit."Claim" ((ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS decision_natural_id_idx ON labkit."Decision" ((ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS criterion_natural_id_idx ON labkit."Criterion" ((ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS criterionevaluation_natural_id_idx ON labkit."CriterionEvaluation" ((ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS gate_natural_id_idx ON labkit."Gate" ((ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS review_natural_id_idx ON labkit."Review" ((ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS artefact_natural_id_idx ON labkit."Artefact" ((ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS computation_natural_id_idx ON labkit."Computation" ((ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS task_natural_id_idx ON labkit."Task" ((ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)));
--> statement-breakpoint

-- CQRS read-side views, one per label. These select directly off the
-- label's own Postgres table (AGE materializes every label as a real
-- table — see .claude/skills/postgres-age/SKILL.md) rather than wrapping
-- cypher() — simpler and avoids the ::vertex-suffix parsing that a
-- cypher()-backed view would otherwise need. This is the ONLY sanctioned
-- read path for natural-id-keyed lookups from outside src/db/graph.ts —
-- AGE's internal graphid never appears in a column list here.
CREATE VIEW labkit_questions AS
  SELECT labkit_prop(properties, 'natural_id') AS natural_id,
         labkit_prop(properties, 'project_id') AS project_id,
         labkit_prop(properties, 'name') AS name,
         labkit_prop(properties, 'is_open') AS is_open
  FROM labkit."Question";
--> statement-breakpoint

CREATE VIEW labkit_lines_of_enquiry AS
  SELECT labkit_prop(properties, 'natural_id') AS natural_id,
         labkit_prop(properties, 'project_id') AS project_id,
         labkit_prop(properties, 'name') AS name
  FROM labkit."LineOfEnquiry";
--> statement-breakpoint

CREATE VIEW labkit_evidence_units AS
  SELECT labkit_prop(properties, 'natural_id') AS natural_id,
         labkit_prop(properties, 'project_id') AS project_id,
         labkit_prop(properties, 'role') AS role
  FROM labkit."EvidenceUnit";
--> statement-breakpoint

CREATE VIEW labkit_evidence AS
  SELECT labkit_prop(properties, 'natural_id') AS natural_id,
         labkit_prop(properties, 'project_id') AS project_id,
         labkit_prop(properties, 'statement') AS statement
  FROM labkit."Evidence";
--> statement-breakpoint

CREATE VIEW labkit_claims AS
  SELECT labkit_prop(properties, 'natural_id') AS natural_id,
         labkit_prop(properties, 'project_id') AS project_id,
         labkit_prop(properties, 'name') AS name,
         labkit_prop(properties, 'kind') AS kind
  FROM labkit."Claim";
--> statement-breakpoint

CREATE VIEW labkit_decisions AS
  SELECT labkit_prop(properties, 'natural_id') AS natural_id,
         labkit_prop(properties, 'project_id') AS project_id,
         labkit_prop(properties, 'reason') AS reason,
         labkit_prop(properties, 'evidence') AS evidence,
         labkit_prop(properties, 'invalidation_check') AS invalidation_check,
         labkit_prop(properties, 'is_open') AS is_open,
         labkit_prop(properties, 'closed_at') AS closed_at
  FROM labkit."Decision";
--> statement-breakpoint

CREATE VIEW labkit_criteria AS
  SELECT labkit_prop(properties, 'natural_id') AS natural_id,
         labkit_prop(properties, 'project_id') AS project_id,
         labkit_prop(properties, 'proposition') AS proposition
  FROM labkit."Criterion";
--> statement-breakpoint

CREATE VIEW labkit_criterion_evaluations AS
  SELECT labkit_prop(properties, 'natural_id') AS natural_id,
         labkit_prop(properties, 'value') AS value,
         labkit_prop(properties, 'outcome') AS outcome,
         labkit_prop(properties, 'evaluated_at') AS evaluated_at,
         labkit_prop(properties, 'evidence_ref') AS evidence_ref
  FROM labkit."CriterionEvaluation";
--> statement-breakpoint

CREATE VIEW labkit_gates AS
  SELECT labkit_prop(properties, 'natural_id') AS natural_id,
         labkit_prop(properties, 'project_id') AS project_id,
         labkit_prop(properties, 'consequence') AS consequence
  FROM labkit."Gate";
--> statement-breakpoint

CREATE VIEW labkit_reviews AS
  SELECT labkit_prop(properties, 'natural_id') AS natural_id,
         labkit_prop(properties, 'project_id') AS project_id,
         labkit_prop(properties, 'verdict') AS verdict
  FROM labkit."Review";
--> statement-breakpoint

CREATE VIEW labkit_artefacts AS
  SELECT labkit_prop(properties, 'natural_id') AS natural_id,
         labkit_prop(properties, 'kind') AS kind,
         labkit_prop(properties, 'logical_name') AS logical_name,
         labkit_prop(properties, 'content_hash') AS content_hash,
         labkit_prop(properties, 'uri') AS uri,
         labkit_prop(properties, 'external_ref') AS external_ref,
         labkit_prop(properties, 'invalidated') AS invalidated
  FROM labkit."Artefact";
--> statement-breakpoint

CREATE VIEW labkit_computations AS
  SELECT labkit_prop(properties, 'natural_id') AS natural_id,
         labkit_prop(properties, 'kind') AS kind,
         labkit_prop(properties, 'status') AS status,
         labkit_prop(properties, 'backend') AS backend,
         labkit_prop(properties, 'external_run_id') AS external_run_id,
         labkit_prop(properties, 'started_at') AS started_at,
         labkit_prop(properties, 'finished_at') AS finished_at,
         labkit_prop(properties, 'code_revision') AS code_revision,
         labkit_prop(properties, 'environment_ref') AS environment_ref
  FROM labkit."Computation";
--> statement-breakpoint

CREATE VIEW labkit_tasks AS
  SELECT labkit_prop(properties, 'natural_id') AS natural_id,
         labkit_prop(properties, 'objective') AS objective,
         labkit_prop(properties, 'inputs') AS inputs,
         labkit_prop(properties, 'outputs') AS outputs,
         labkit_prop(properties, 'acceptance') AS acceptance,
         labkit_prop(properties, 'is_open') AS is_open
  FROM labkit."Task";
--> statement-breakpoint
