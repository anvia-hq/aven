ALTER TABLE "runtimes" ADD COLUMN "parent_runtime_id" uuid;--> statement-breakpoint
ALTER TABLE "runtimes" ADD CONSTRAINT "runtimes_parent_runtime_id_runtimes_id_fk" FOREIGN KEY ("parent_runtime_id") REFERENCES "public"."runtimes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "runtimes_parent_idx" ON "runtimes" USING btree ("parent_runtime_id");