CREATE TABLE "cloud_provider_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"base" text DEFAULT '' NOT NULL,
	"project" text DEFAULT '' NOT NULL,
	"runner_url" text DEFAULT '' NOT NULL,
	"api_key_encrypted" text,
	"key_hint" text DEFAULT '' NOT NULL,
	"compute_micros_per_hour" integer,
	"storage_micros_per_gb_month" integer,
	"draining_since" timestamp with time zone,
	"drained_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud_sandboxes" (
	"runtime_id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"provider_config_id" uuid,
	"external_id" text,
	"machine_type" text DEFAULT 'default' NOT NULL,
	"state" text DEFAULT 'absent' NOT NULL,
	"dirty" boolean DEFAULT false NOT NULL,
	"runtime_snapshot_name" text,
	"running_since" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stopped_at" timestamp with time zone,
	"drain_requested_at" timestamp with time zone,
	"last_extended_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"delete_attempts" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"last_error" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "computer_usage" ADD COLUMN "provider_config_id" uuid;--> statement-breakpoint
ALTER TABLE "computer_usage" ADD COLUMN "machine_type" text;--> statement-breakpoint
ALTER TABLE "computer_usage" ADD COLUMN "estimated_cost_micros" integer;--> statement-breakpoint
ALTER TABLE "project_environments" ADD COLUMN "provider_config_id" uuid;--> statement-breakpoint
ALTER TABLE "project_environments" ADD COLUMN "delete_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "project_environments" ADD COLUMN "next_retry_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_environments" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "cloud_sandboxes" ADD CONSTRAINT "cloud_sandboxes_runtime_id_runtimes_id_fk" FOREIGN KEY ("runtime_id") REFERENCES "public"."runtimes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_sandboxes" ADD CONSTRAINT "cloud_sandboxes_provider_config_id_cloud_provider_configs_id_fk" FOREIGN KEY ("provider_config_id") REFERENCES "public"."cloud_provider_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_provider_configs_active_idx" ON "cloud_provider_configs" USING btree ("status") WHERE "cloud_provider_configs"."status" = 'active';--> statement-breakpoint
CREATE INDEX "cloud_provider_configs_status_idx" ON "cloud_provider_configs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cloud_sandboxes_state_expires_idx" ON "cloud_sandboxes" USING btree ("state","expires_at");--> statement-breakpoint
CREATE INDEX "cloud_sandboxes_state_retry_idx" ON "cloud_sandboxes" USING btree ("state","next_retry_at");--> statement-breakpoint
CREATE INDEX "cloud_sandboxes_config_state_idx" ON "cloud_sandboxes" USING btree ("provider_config_id","state");--> statement-breakpoint
ALTER TABLE "computer_usage" ADD CONSTRAINT "computer_usage_provider_config_id_cloud_provider_configs_id_fk" FOREIGN KEY ("provider_config_id") REFERENCES "public"."cloud_provider_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_environments" ADD CONSTRAINT "project_environments_provider_config_id_cloud_provider_configs_id_fk" FOREIGN KEY ("provider_config_id") REFERENCES "public"."cloud_provider_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_environments_status_retry_idx" ON "project_environments" USING btree ("status","next_retry_at");