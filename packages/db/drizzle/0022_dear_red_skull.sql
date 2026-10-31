CREATE TABLE "variable_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" uuid,
	"user_id" text,
	"actor_id" text,
	"name" text NOT NULL,
	"action" text NOT NULL,
	"secret" boolean NOT NULL,
	"source" text DEFAULT 'settings' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "variable_events" ADD CONSTRAINT "variable_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_events" ADD CONSTRAINT "variable_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_events" ADD CONSTRAINT "variable_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_events" ADD CONSTRAINT "variable_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "variable_events_organization_idx" ON "variable_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "variable_events_project_idx" ON "variable_events" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "variable_events_user_idx" ON "variable_events" USING btree ("user_id","created_at");