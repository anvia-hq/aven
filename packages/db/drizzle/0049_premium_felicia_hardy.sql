CREATE TABLE "thread_run_times" (
	"thread_id" uuid NOT NULL,
	"message_index" integer NOT NULL,
	"worked_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "thread_run_times_thread_id_message_index_pk" PRIMARY KEY("thread_id","message_index")
);
--> statement-breakpoint
ALTER TABLE "thread_run_times" ADD CONSTRAINT "thread_run_times_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;