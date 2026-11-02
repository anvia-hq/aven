CREATE TABLE "mcp_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"url" text NOT NULL,
	"headers" text NOT NULL,
	"header_names" text[] DEFAULT '{}' NOT NULL,
	"target" text DEFAULT 'all' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"allow_local" boolean DEFAULT false NOT NULL,
	"last_error" text,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_servers_user_slug_idx" ON "mcp_servers" USING btree ("user_id","slug");--> statement-breakpoint
CREATE INDEX "mcp_servers_user_idx" ON "mcp_servers" USING btree ("user_id");