CREATE TABLE "bot_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"bot_id" uuid NOT NULL,
	"objective" text NOT NULL,
	"checks" jsonb NOT NULL,
	"phase" text NOT NULL,
	"blocked_reason" text,
	"rounds_started" integer DEFAULT 0 NOT NULL,
	"max_rounds" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bot_goals" ADD CONSTRAINT "bot_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_goals" ADD CONSTRAINT "bot_goals_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bot_goals_bot_idx" ON "bot_goals" USING btree ("bot_id");--> statement-breakpoint
CREATE INDEX "bot_goals_phase_idx" ON "bot_goals" USING btree ("phase");