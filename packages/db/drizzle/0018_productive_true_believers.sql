CREATE TABLE "project_variables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"value_encrypted" text NOT NULL,
	"value_hint" text,
	"secret" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_variables" ADD CONSTRAINT "project_variables_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_variables_project_idx" ON "project_variables" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_variables_project_name_idx" ON "project_variables" USING btree ("project_id","name");