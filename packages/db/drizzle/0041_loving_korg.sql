DROP INDEX "bot_threads_notified_idx";--> statement-breakpoint
ALTER TABLE "bot_threads" ADD COLUMN "run_started_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "bot_threads_owed_idx" ON "bot_threads" USING btree ("thread_id") WHERE "bot_threads"."notified_at" IS NULL;