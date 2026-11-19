CREATE TABLE "thread_context_splits" (
	"thread_id" uuid PRIMARY KEY NOT NULL,
	"used_tokens" integer NOT NULL,
	"segments" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "thread_context_splits" ADD CONSTRAINT "thread_context_splits_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;