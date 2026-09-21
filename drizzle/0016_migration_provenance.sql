-- lock-strategy: online
-- Which migrations this record has, who applied them, and when.
--
-- `drizzle.__drizzle_migrations` has the hash and the authoring time and
-- nothing about the binary that ran it. This table answers "how did this
-- database get into that state".
CREATE TABLE public.__migrations (
  id integer PRIMARY KEY NOT NULL,
  migrator text NOT NULL,
  hash text NOT NULL,
  created_at timestamptz,
  applied_at timestamptz,
  labkit_version text NOT NULL DEFAULT '__UNKNOWN_VERSION__'
);--> statement-breakpoint

CREATE UNIQUE INDEX __migrations_hash_idx ON public.__migrations (hash);--> statement-breakpoint

GRANT SELECT ON public.__migrations TO labkit_app;--> statement-breakpoint

-- Which build last reconciled a workspace's graph. Provisioning is additive and
-- idempotent, so it only has to run again when the build changes.
CREATE TABLE public.__workspace (
  tenant_id integer PRIMARY KEY NOT NULL REFERENCES public.tenants(id),
  labkit_version text NOT NULL,
  provisioned_at timestamptz NOT NULL
);--> statement-breakpoint

GRANT SELECT ON public.__workspace TO labkit_app;
