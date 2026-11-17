UPDATE "projects" SET "github_installation_id" = NULL WHERE "github_installation_id" IN (SELECT "id" FROM "github_installations" WHERE "app_id" IS NOT NULL);--> statement-breakpoint
DELETE FROM "github_installations" WHERE "app_id" IS NOT NULL;--> statement-breakpoint
DELETE FROM "github_user_tokens" WHERE "app_key" <> 'platform';--> statement-breakpoint
ALTER TABLE "github_installations" DROP CONSTRAINT "github_installations_app_id_github_apps_id_fk";--> statement-breakpoint
ALTER TABLE "github_apps" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "github_apps" CASCADE;--> statement-breakpoint
ALTER TABLE "github_user_tokens" DROP CONSTRAINT "github_user_tokens_user_app_unique";--> statement-breakpoint
ALTER TABLE "github_installations" DROP COLUMN "app_id";--> statement-breakpoint
ALTER TABLE "github_user_tokens" DROP COLUMN "app_key";--> statement-breakpoint
ALTER TABLE "github_user_tokens" ADD CONSTRAINT "github_user_tokens_user_id_unique" UNIQUE("user_id");
