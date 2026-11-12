import { CODEX_MODELS } from "@aven/protocol/codex-login";

export const CODEX_CHOICES = [{ id: "default", label: "Default" }, ...CODEX_MODELS] as const;

export const CODEX_GROUP = "ChatGPT login · Codex";
