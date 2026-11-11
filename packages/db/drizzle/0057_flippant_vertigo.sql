ALTER TABLE "runtimes" ADD COLUMN "provider" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "agent_backend" text DEFAULT 'native' NOT NULL;