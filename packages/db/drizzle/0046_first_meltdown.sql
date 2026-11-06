ALTER TABLE "github_installations" DROP CONSTRAINT "github_installations_app_id_github_apps_id_fk";
--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_app_id_github_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."github_apps"("id") ON DELETE no action ON UPDATE no action;