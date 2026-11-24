CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"automation_id" uuid NOT NULL,
	"thread_id" uuid,
	"trigger_summary" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"runtime_id" uuid NOT NULL,
	"name" text NOT NULL,
	"trigger_kind" text NOT NULL,
	"cron" text,
	"timezone" text,
	"webhook_token_hash" text,
	"webhook_token_hint" text,
	"prompt" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_status" text,
	"last_thread_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automations_webhook_token_hash_unique" UNIQUE("webhook_token_hash")
);
--> statement-breakpoint
CREATE TABLE "thread_narrations" (
	"thread_id" uuid NOT NULL,
	"tool_id" text NOT NULL,
	"label" text NOT NULL,
	"outcome" text,
	"icon" text,
	"tone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "thread_narrations_thread_id_tool_id_pk" PRIMARY KEY("thread_id","tool_id")
);
--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_runtime_id_runtimes_id_fk" FOREIGN KEY ("runtime_id") REFERENCES "public"."runtimes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_last_thread_id_threads_id_fk" FOREIGN KEY ("last_thread_id") REFERENCES "public"."threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_narrations" ADD CONSTRAINT "thread_narrations_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_runs_automation_created_idx" ON "automation_runs" USING btree ("automation_id","created_at");--> statement-breakpoint
CREATE INDEX "automations_org_user_idx" ON "automations" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "automations_due_idx" ON "automations" USING btree ("enabled","trigger_kind","next_run_at");