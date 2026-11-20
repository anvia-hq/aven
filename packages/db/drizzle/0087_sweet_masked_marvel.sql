DROP INDEX "github_installations_organization_idx";--> statement-breakpoint
DROP INDEX "mcp_servers_user_idx";--> statement-breakpoint
DROP INDEX "thread_pull_requests_thread_idx";--> statement-breakpoint
CREATE INDEX "thread_mentions_user_idx" ON "thread_mentions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "thread_pins_user_idx" ON "thread_pins" USING btree ("user_id");