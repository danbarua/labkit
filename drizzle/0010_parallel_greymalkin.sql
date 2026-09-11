-- lock-strategy: online
ALTER TABLE "labkit_event" ALTER COLUMN "git_hash" DROP NOT NULL;
--> statement-breakpoint
UPDATE "labkit_event" SET "git_hash" = NULL
WHERE "git_hash" = '0000000000000000000000000000000000000000' OR "git_hash" = '';