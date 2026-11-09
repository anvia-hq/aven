CREATE TABLE "thread_message_senders" (
	"thread_id" uuid NOT NULL,
	"message_index" integer NOT NULL,
	"sender_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "thread_message_senders_thread_id_message_index_pk" PRIMARY KEY("thread_id","message_index")
);
--> statement-breakpoint
ALTER TABLE "thread_message_senders" ADD CONSTRAINT "thread_message_senders_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_message_senders" ADD CONSTRAINT "thread_message_senders_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;