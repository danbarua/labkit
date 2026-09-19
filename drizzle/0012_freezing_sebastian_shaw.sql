-- lock-strategy: online
-- `labkit_event.seq` takes no default, because 0013's `labkit_record_event`
-- chooses the number.
--
-- One number per act, from the workspace's `labkit_natural_id_seq`, used as
-- the event's number and in the id of every record the act creates. A column
-- default here would hand out a second, different number.
--
-- `public.labkit_event` is the template every workspace copy is made from, so
-- dropping the default here is what stops a new workspace inheriting one.
-- `labkit_event_seq_seq` is left in place: nothing draws from it, and dropping
-- a sequence is not something a migration should do to a record it cannot see.
ALTER TABLE "labkit_event" ALTER COLUMN "seq" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "labkit_event" ALTER COLUMN "seq" DROP DEFAULT;
