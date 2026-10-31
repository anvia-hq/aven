CREATE TABLE "environment_variables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" uuid,
	"user_id" text,
	"name" text NOT NULL,
	"value_encrypted" text NOT NULL,
	"value_hint" text,
	"secret" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "environment_variables_one_scope" CHECK (not ("environment_variables"."project_id" is not null and "environment_variables"."user_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "environment_variables" ADD CONSTRAINT "environment_variables_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_variables" ADD CONSTRAINT "environment_variables_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_variables" ADD CONSTRAINT "environment_variables_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "environment_variables_organization_idx" ON "environment_variables" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "environment_variables_workspace_name_idx" ON "environment_variables" USING btree ("organization_id","name") WHERE "environment_variables"."project_id" is null and "environment_variables"."user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "environment_variables_project_name_idx" ON "environment_variables" USING btree ("project_id","name") WHERE "environment_variables"."project_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "environment_variables_personal_name_idx" ON "environment_variables" USING btree ("organization_id","user_id","name") WHERE "environment_variables"."user_id" is not null;