CREATE TABLE "bot_threads" (
	"thread_id" uuid PRIMARY KEY NOT NULL,
	"bot_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"notified_at" timestamp with time zone,
	"follow_ups" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bot_threads" ADD CONSTRAINT "bot_threads_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_threads" ADD CONSTRAINT "bot_threads_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_threads" ADD CONSTRAINT "bot_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bot_threads_bot_idx" ON "bot_threads" USING btree ("bot_id");--> statement-breakpoint
CREATE INDEX "bot_threads_notified_idx" ON "bot_threads" USING btree ("notified_at");