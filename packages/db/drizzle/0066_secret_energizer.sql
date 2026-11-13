CREATE TABLE "thread_plan_limits" (
	"thread_id" uuid NOT NULL,
	"window" text NOT NULL,
	"status" text NOT NULL,
	"percent" real NOT NULL,
	"resets_at" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "thread_plan_limits_thread_id_window_pk" PRIMARY KEY("thread_id","window")
);
--> statement-breakpoint
ALTER TABLE "thread_plan_limits" ADD CONSTRAINT "thread_plan_limits_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;