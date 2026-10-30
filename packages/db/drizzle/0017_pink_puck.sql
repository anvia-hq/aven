CREATE TABLE "github_user_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"github_user_id" bigint NOT NULL,
	"login" text NOT NULL,
	"name" text,
	"access_token_encrypted" text NOT NULL,
	"access_expires_at" timestamp with time zone,
	"refresh_token_encrypted" text,
	"refresh_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_user_tokens_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "github_user_tokens" ADD CONSTRAINT "github_user_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;