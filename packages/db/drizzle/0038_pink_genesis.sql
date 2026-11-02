DROP INDEX "projects_org_repo_idx";--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_org_repo_idx" ON "projects" USING btree ("organization_id","repo_full_name") WHERE "projects"."deleted_at" is null;