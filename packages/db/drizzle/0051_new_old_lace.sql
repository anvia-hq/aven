CREATE TABLE "decision_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"model_id" text NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"key_hint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decision_models_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
ALTER TABLE "decision_models" ADD CONSTRAINT "decision_models_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;