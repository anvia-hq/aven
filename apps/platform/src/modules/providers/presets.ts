import { COMPATIBLE_VENDORS } from "@aven/protocol/providers";

import type { CompatiblePreset } from "./types";

export const COMPATIBLE_PRESETS: readonly CompatiblePreset[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Many vendors' models through one OpenRouter key.",
    baseUrl: COMPATIBLE_VENDORS.openrouter.baseUrl,
    needsKey: true,
    keyPlaceholder: "sk-or-…",
  },
  {
    id: "groq",
    name: "Groq",
    description: "Fast open models on Groq's hardware.",
    baseUrl: COMPATIBLE_VENDORS.groq.baseUrl,
    needsKey: true,
    keyPlaceholder: "gsk_…",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "DeepSeek chat and reasoning models.",
    baseUrl: COMPATIBLE_VENDORS.deepseek.baseUrl,
    needsKey: true,
    keyPlaceholder: "sk-…",
  },
  {
    id: "mistral",
    name: "Mistral",
    description: "Mistral and Codestral models through La Plateforme.",
    baseUrl: COMPATIBLE_VENDORS.mistral.baseUrl,
    needsKey: true,
    keyPlaceholder: "Mistral API key",
  },
  {
    id: "xai",
    name: "xAI",
    description: "Grok models through the xAI API.",
    baseUrl: COMPATIBLE_VENDORS.xai.baseUrl,
    needsKey: true,
    keyPlaceholder: "xai-…",
  },
  {
    id: "alibaba",
    name: "Alibaba",
    description: "Qwen and other models through Alibaba Cloud Model Studio (international).",
    baseUrl: COMPATIBLE_VENDORS.alibaba.baseUrl,
    needsKey: true,
    keyPlaceholder: "sk-…",
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    description: "Open coding models on the OpenCode Go subscription.",
    baseUrl: COMPATIBLE_VENDORS["opencode-go"].baseUrl,
    needsKey: true,
    keyPlaceholder: "OpenCode API key",
  },
  {
    id: "moonshot",
    name: "Moonshot",
    description: "Kimi models through the Moonshot AI platform.",
    baseUrl: COMPATIBLE_VENDORS.moonshot.baseUrl,
    needsKey: true,
    keyPlaceholder: "sk-…",
  },
  {
    id: "zai",
    name: "Z.ai",
    description: "GLM models through the Z.ai API.",
    baseUrl: COMPATIBLE_VENDORS.zai.baseUrl,
    needsKey: true,
    keyPlaceholder: "Z.ai API key",
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Models running on this machine with Ollama, no key needed.",
    baseUrl: COMPATIBLE_VENDORS.ollama.baseUrl,
    needsKey: false,
    keyPlaceholder: "Not needed",
  },
];

export function presetOf(provider: {
  kind: string;
  baseUrl: string | null;
}): CompatiblePreset | undefined {
  if (provider.kind !== "openai-compatible") return undefined;

  const address = provider.baseUrl?.replace(/\/+$/, "");
  return COMPATIBLE_PRESETS.find((preset) => preset.baseUrl === address);
}
