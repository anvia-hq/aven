ALTER TABLE "bots" ADD COLUMN "last_said_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bots" ADD COLUMN "last_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bots" ADD COLUMN "question_asked_at" timestamp with time zone;