ALTER TABLE "bots" ALTER COLUMN "handle" DROP DEFAULT;--> statement-breakpoint
CREATE UNIQUE INDEX "bots_user_handle_idx" ON "bots" USING btree ("user_id","handle");