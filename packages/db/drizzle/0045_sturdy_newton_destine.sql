CREATE TABLE "github_apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"slug" text NOT NULL,
	"credentials_encrypted" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_apps_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
ALTER TABLE "github_user_tokens" DROP CONSTRAINT "github_user_tokens_user_id_unique";--> statement-breakpoint
ALTER TABLE "github_installations" ADD COLUMN "app_id" uuid;--> statement-breakpoint
ALTER TABLE "github_user_tokens" ADD COLUMN "app_key" text DEFAULT 'platform' NOT NULL;--> statement-breakpoint
ALTER TABLE "github_apps" ADD CONSTRAINT "github_apps_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_apps" ADD CONSTRAINT "github_apps_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_app_id_github_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."github_apps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_user_tokens" ADD CONSTRAINT "github_user_tokens_user_app_unique" UNIQUE("user_id","app_key");