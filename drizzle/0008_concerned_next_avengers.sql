-- lock-strategy: online
-- allow-destructive: the spike replaces the event shape. `created`, `edges`
-- and `detail` are what `changes` and `command` say in full, so keeping
-- them would be two records of one act disagreeing with each other.
ALTER TABLE "labkit_event" ADD COLUMN "changes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "labkit_event" ADD COLUMN "command" jsonb NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "labkit_event_created_idx";--> statement-breakpoint
ALTER TABLE "labkit_event" DROP COLUMN "created";--> statement-breakpoint
ALTER TABLE "labkit_event" DROP COLUMN "edges";--> statement-breakpoint
ALTER TABLE "labkit_event" DROP COLUMN "detail";
--> statement-breakpoint
-- Hand-added: drizzle-kit does not emit a GIN index for a jsonb column.
-- "Which act created this record?" is asked as
-- `changes @> '[{"change":"NodeCreated","id":$1}]'`, which a btree cannot
-- answer. `jsonb_path_ops` because containment is the only operator used.
CREATE INDEX "labkit_event_changes_idx" ON "public"."labkit_event" USING gin ("changes" jsonb_path_ops);
