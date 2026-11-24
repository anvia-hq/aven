import { IconPlugConnected } from "@tabler/icons-react";
import type { ComponentType, SVGProps } from "react";

import {
  AlibabaMark,
  AzureColorMark,
  BedrockMark,
  ClaudeColorMark,
  DeepSeekMark,
  GeminiColorMark,
  GroqMark,
  MistralMark,
  MoonshotMark,
  OllamaMark,
  OpenAiMark,
  OpenCodeMark,
  OpenRouterMark,
  VertexMark,
  XaiMark,
  ZaiMark,
} from "@/components/brand-icons";

import { presetOf } from "../presets";
import type { CompatiblePreset, ProviderKind } from "../types";

const LOGOS = {
  openai: OpenAiMark,
  anthropic: ClaudeColorMark,
  gemini: GeminiColorMark,
  azure: AzureColorMark,
  bedrock: BedrockMark,
  vertex: VertexMark,
  "claude-subscription": ClaudeColorMark,
  "codex-subscription": OpenAiMark,
} as const;

const PRESET_LOGOS = {
  openrouter: OpenRouterMark,
  groq: GroqMark,
  deepseek: DeepSeekMark,
  mistral: MistralMark,
  xai: XaiMark,
  alibaba: AlibabaMark,
  "opencode-go": OpenCodeMark,
  moonshot: MoonshotMark,
  zai: ZaiMark,
  ollama: OllamaMark,
} as const satisfies Record<CompatiblePreset["id"], unknown>;

const SIZES = { sm: "size-4", lg: "size-7" } as const;

type Props = {
  kind: ProviderKind;
  baseUrl?: string | null;
  preset?: CompatiblePreset["id"];
  size?: keyof typeof SIZES;
};

export function ProviderLogo({ kind, baseUrl = null, preset, size = "sm" }: Props) {
  const service = preset ?? presetOf({ kind, baseUrl })?.id;
  let Logo: ComponentType<SVGProps<SVGSVGElement>> | undefined;

  if (kind !== "openai-compatible") Logo = LOGOS[kind];
  else if (service) Logo = PRESET_LOGOS[service];
  else Logo = IconPlugConnected;

  if (!Logo) return null;

  return <Logo aria-hidden className={`${SIZES[size]} shrink-0 text-foreground`} />;
}
