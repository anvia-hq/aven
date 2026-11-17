CREATE TABLE "project_environments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"setup_digest" text NOT NULL,
	"status" text DEFAULT 'saving' NOT NULL,
	"error" text,
	"saved_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runtimes" ADD COLUMN "environment_snapshot" text;--> statement-breakpoint
ALTER TABLE "project_environments" ADD CONSTRAINT "project_environments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_environments" ADD CONSTRAINT "project_environments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_environments_project_provider_idx" ON "project_environments" USING btree ("project_id","provider");--> statement-breakpoint
CREATE INDEX "project_environments_expiry_idx" ON "project_environments" USING btree ("expires_at");