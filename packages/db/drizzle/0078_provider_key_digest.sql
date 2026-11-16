ALTER TABLE "providers" ADD COLUMN "key_digest" text;--> statement-breakpoint
CREATE INDEX "providers_key_digest_idx" ON "providers" USING btree ("key_digest");