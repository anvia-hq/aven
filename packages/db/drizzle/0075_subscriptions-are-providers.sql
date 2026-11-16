-- A Claude setup token and a Codex API key become provider rows of their own kind, so one table
-- holds what runs a thread (decision 0309). Tokens are copied as they are: the same key decrypts
-- them. A person who had no provider at all makes their subscription the default, which the unique
-- default index allows once.
INSERT INTO "providers" ("user_id", "kind", "name", "model_id", "api_key_encrypted", "key_hint", "is_default", "created_at", "updated_at")
SELECT
	"user_id",
	'claude-subscription',
	'Claude subscription',
	NULL,
	"token_encrypted",
	"token_hint",
	NOT EXISTS (SELECT 1 FROM "providers" AS "existing" WHERE "existing"."user_id" = "claude_setup_tokens"."user_id"),
	"created_at",
	"updated_at"
FROM "claude_setup_tokens";--> statement-breakpoint
INSERT INTO "providers" ("user_id", "kind", "name", "model_id", "api_key_encrypted", "key_hint", "is_default", "created_at", "updated_at")
SELECT
	"user_id",
	'codex-subscription',
	'Codex subscription',
	NULL,
	"token_encrypted",
	"token_hint",
	NOT EXISTS (SELECT 1 FROM "providers" AS "existing" WHERE "existing"."user_id" = "codex_setup_tokens"."user_id"),
	"created_at",
	"updated_at"
FROM "codex_setup_tokens";
