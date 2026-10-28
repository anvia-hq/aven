CREATE TABLE "agent_memory_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_session_id" uuid NOT NULL,
	"run_id" text NOT NULL,
	"error" jsonb NOT NULL,
	"messages" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_memory_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_session_id" uuid NOT NULL,
	"run_id" text NOT NULL,
	"turn" integer NOT NULL,
	"position" integer NOT NULL,
	"role" text NOT NULL,
	"message" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_memory_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_key" text NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"compaction_state" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_memory_errors" ADD CONSTRAINT "agent_memory_errors_memory_session_id_agent_memory_sessions_id_fk" FOREIGN KEY ("memory_session_id") REFERENCES "public"."agent_memory_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_messages" ADD CONSTRAINT "agent_memory_messages_memory_session_id_agent_memory_sessions_id_fk" FOREIGN KEY ("memory_session_id") REFERENCES "public"."agent_memory_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_memory_messages_session_position_key" ON "agent_memory_messages" USING btree ("memory_session_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_memory_sessions_scope_key_key" ON "agent_memory_sessions" USING btree ("scope_key");