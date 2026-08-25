-- lock-strategy: online
--
-- **Every object below is schema-qualified `public.` by hand.** drizzle-kit
-- generates unqualified DDL, and migration 0001's
-- `SET search_path = ag_catalog, "$user", public` is still the active session
-- setting when this file runs -- so an unqualified `CREATE TABLE` lands in
-- `ag_catalog`. It did: the table was created, the migration recorded itself as
-- applied, and `public.labkit_event` did not exist. 0002's header records the
-- same trap catching the natural-id functions; this is the second time.
--
-- The only ALTER TABLE below adds the tenant foreign key to `labkit_event`,
-- which this same migration creates two statements earlier. It has no rows and
-- no readers, so the lock is on an empty table nothing can be waiting for.
-- Stated rather than assumed, because `check:migrations` is right to ask and a
-- future ALTER on a populated `labkit_event` would need a real answer here.

CREATE TABLE "public"."labkit_event" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"at" text NOT NULL,
	"operation" text NOT NULL,
	"subject" text NOT NULL,
	"created" text[] DEFAULT '{}' NOT NULL,
	"attribution_label" text NOT NULL,
	"attribution_id" text NOT NULL,
	"git_hash" text NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
ALTER TABLE "public"."labkit_event" ADD CONSTRAINT "labkit_event_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "labkit_event_tenant_seq_idx" ON "public"."labkit_event" USING btree ("tenant_id","seq");--> statement-breakpoint
CREATE INDEX "labkit_event_tenant_subject_idx" ON "public"."labkit_event" USING btree ("tenant_id","subject");--> statement-breakpoint
CREATE INDEX "labkit_event_tenant_agent_idx" ON "public"."labkit_event" USING btree ("tenant_id","attribution_id","seq");--> statement-breakpoint
-- Hand-added: drizzle-kit does not emit a GIN index for an array column.
-- `created @> ARRAY[$id]` is how "which act minted this record?" is asked, and
-- a btree cannot answer containment. Not tenant-scoped in the index itself --
-- GIN takes the array alone and the tenant filter rides along in the WHERE.
CREATE INDEX "labkit_event_created_idx" ON "public"."labkit_event" USING gin ("created");
