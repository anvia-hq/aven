ALTER TABLE "thread_mentions" ADD COLUMN "author_id" text;--> statement-breakpoint
ALTER TABLE "thread_mentions" ADD COLUMN "excerpt" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "thread_mentions" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "thread_mentions" ADD CONSTRAINT "thread_mentions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;