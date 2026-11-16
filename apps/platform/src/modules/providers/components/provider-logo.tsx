import type { ComponentType, SVGProps } from "react";

import {
  AzureColorMark,
  BedrockMark,
  ClaudeColorMark,
  DeepSeekMark,
  GeminiColorMark,
  GroqMark,
  MistralMark,
  OllamaMark,
  OpenAiMark,
  OpenRouterMark,
  VertexMark,
  XaiMark,
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

  if (!Logo) return null;

  return <Logo aria-hidden className={`${SIZES[size]} shrink-0 text-foreground`} />;
}
