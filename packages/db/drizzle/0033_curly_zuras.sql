CREATE TABLE "thread_pull_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"url" text NOT NULL,
	"branch" text NOT NULL,
	"title" text NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "thread_pull_requests_thread_number_unique" UNIQUE("thread_id","number")
);
--> statement-breakpoint
ALTER TABLE "thread_pull_requests" ADD CONSTRAINT "thread_pull_requests_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "thread_pull_requests_thread_idx" ON "thread_pull_requests" USING btree ("thread_id");