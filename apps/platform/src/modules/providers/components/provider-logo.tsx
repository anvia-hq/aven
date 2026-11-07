import type { ComponentType, SVGProps } from "react";

import { Servers } from "@mynaui/icons-react";

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

import { presetOf, type CompatiblePreset } from "../presets";
import type { ProviderKind } from "../types";

const LOGOS = {
  openai: OpenAiMark,
  anthropic: ClaudeColorMark,
  gemini: GeminiColorMark,
  azure: AzureColorMark,
  bedrock: BedrockMark,
  vertex: VertexMark,
} as const;

// The services with a panel of their own (decision 0137) have their own marks.
const PRESET_LOGOS = {
  openrouter: OpenRouterMark,
  groq: GroqMark,
  deepseek: DeepSeekMark,
  mistral: MistralMark,
  xai: XaiMark,
  ollama: OllamaMark,
} as const satisfies Record<CompatiblePreset["id"], unknown>;

type Props = {
  kind: ProviderKind;
  /** A saved provider's address, which tells a service with a panel of its own from any server. */
  baseUrl?: string | null;
  /** A panel's service, when no saved provider is at hand. */
  preset?: CompatiblePreset["id"];
};

export function ProviderLogo({ kind, baseUrl = null, preset }: Props) {
  // Other OpenAI-compatible servers have no single vendor, so they get a generic icon.
  const service = preset ?? presetOf({ kind, baseUrl })?.id;
  let Logo: ComponentType<SVGProps<SVGSVGElement>> = Servers;
  if (kind !== "openai-compatible") Logo = LOGOS[kind];
  else if (service) Logo = PRESET_LOGOS[service];
  return <Logo aria-hidden className="size-4 shrink-0 text-foreground" />;
}
