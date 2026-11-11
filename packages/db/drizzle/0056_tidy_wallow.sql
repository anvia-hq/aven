ALTER TABLE "projects" ALTER COLUMN "github_installation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "repo_full_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "clone_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "default_branch" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "directory" text;--> statement-breakpoint
ALTER TABLE "runtimes" ADD COLUMN "directories" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_runtime_directory_idx" ON "projects" USING btree ("runtime_id","directory") WHERE "projects"."deleted_at" is null;