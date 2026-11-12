ALTER TABLE "user_settings" ADD COLUMN "follow_ups_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "follow_ups_provider_id" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "follow_ups_model_id" text;