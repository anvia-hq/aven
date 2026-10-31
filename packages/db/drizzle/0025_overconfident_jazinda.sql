ALTER TABLE "bots" ADD COLUMN "provider_id" uuid;--> statement-breakpoint
ALTER TABLE "bots" ADD COLUMN "model_id" text;--> statement-breakpoint
ALTER TABLE "bots" ADD CONSTRAINT "bots_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE set null ON UPDATE no action;