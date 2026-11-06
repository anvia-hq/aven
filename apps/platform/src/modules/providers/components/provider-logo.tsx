import { Servers } from "@mynaui/icons-react";

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

// OpenAI-compatible servers have no single vendor, so they get a generic icon.
export function ProviderLogo({ kind }: { kind: ProviderKind }) {
  const Logo = kind === "openai-compatible" ? Servers : LOGOS[kind];
  return <Logo aria-hidden className="size-4 shrink-0 text-foreground" />;
}
