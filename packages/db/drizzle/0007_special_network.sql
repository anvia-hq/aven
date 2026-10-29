CREATE TABLE "runtimes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_hint" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "projects_organization_path_idx";--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "runtime_id" uuid;--> statement-breakpoint
ALTER TABLE "runtimes" ADD CONSTRAINT "runtimes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtimes" ADD CONSTRAINT "runtimes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "runtimes_organization_idx" ON "runtimes" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runtimes_token_hash_idx" ON "runtimes" USING btree ("token_hash");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_runtime_id_runtimes_id_fk" FOREIGN KEY ("runtime_id") REFERENCES "public"."runtimes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_local_path_idx" ON "projects" USING btree ("organization_id","project_path") WHERE "projects"."runtime_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_runtime_path_idx" ON "projects" USING btree ("organization_id","runtime_id","project_path") WHERE "projects"."runtime_id" is not null;