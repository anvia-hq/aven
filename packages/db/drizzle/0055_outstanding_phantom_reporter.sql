ALTER TABLE "runtimes" ADD COLUMN "host" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "runtimes" ADD COLUMN "shared" boolean DEFAULT false NOT NULL;