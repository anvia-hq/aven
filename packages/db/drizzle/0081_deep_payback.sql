ALTER TABLE "threads" ADD COLUMN "model_provider_id" uuid;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "model_id" text;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "reasoning_effort" text;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_model_provider_id_providers_id_fk" FOREIGN KEY ("model_provider_id") REFERENCES "public"."providers"("id") ON DELETE set null ON UPDATE no action;