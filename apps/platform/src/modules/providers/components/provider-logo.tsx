import { Cloud, Servers } from "@mynaui/icons-react";

import {
  AzureColorMark,
  ClaudeColorMark,
  GeminiColorMark,
  OpenAiMark,
} from "@/components/brand-icons";

import type { ProviderKind } from "../types";

const LOGOS = {
  openai: OpenAiMark,
  anthropic: ClaudeColorMark,
  gemini: GeminiColorMark,
  azure: AzureColorMark,
} as const;

// OpenAI-compatible servers have no single vendor, so they get a generic icon, and so does Bedrock,
// whose mark is not one of the vendored brand icons.
const GENERIC = { bedrock: Cloud, "openai-compatible": Servers } as const;

export function ProviderLogo({ kind }: { kind: ProviderKind }) {
  const Logo = kind === "bedrock" || kind === "openai-compatible" ? GENERIC[kind] : LOGOS[kind];
  return <Logo aria-hidden className="size-4 shrink-0 text-foreground" />;
}
