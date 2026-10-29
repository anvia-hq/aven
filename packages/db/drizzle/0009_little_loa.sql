DROP INDEX "projects_local_path_idx";--> statement-breakpoint
DROP INDEX "projects_runtime_path_idx";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "project_path";--> statement-breakpoint
ALTER TABLE "threads" DROP COLUMN "project_path";