CREATE INDEX "projects_runtime_idx" ON "projects" USING btree ("runtime_id");--> statement-breakpoint
CREATE INDEX "threads_runtime_idx" ON "threads" USING btree ("runtime_id");