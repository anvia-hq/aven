import type { CodexEffort } from "./types";

export const CODEX_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const satisfies readonly CodexEffort[];

export const CODEX_DEFAULT_EFFORT: CodexEffort = "medium";

export const CODEX_MODELS = [
  {
    id: "default",
    family: "Astra",
    resolved: "gpt-6-astra",
    contextWindow: 272_000,
    isDefault: true,
  },
  {
    id: "astra",
    family: "Astra",
    resolved: "gpt-6-astra",
    contextWindow: 272_000,
    isDefault: false,
  },
  { id: "sol", family: "Sol", resolved: "gpt-6.1-sol", contextWindow: 272_000, isDefault: false },
  {
    id: "terra",
    family: "Terra",
    resolved: "gpt-6.1-terra",
    contextWindow: 500_000,
    isDefault: false,
  },
  { id: "luna", family: "Luna", resolved: "gpt-6-luna", contextWindow: 272_000, isDefault: false },
] as const;

const DEFAULT_MODEL = CODEX_MODELS[0];

export function codexModelOf(modelId: string | undefined) {
  return CODEX_MODELS.find((item) => item.id === (modelId ?? "default")) ?? DEFAULT_MODEL;
}

export function codexResolvedOf(modelId: string | undefined) {
  return codexModelOf(modelId).resolved;
}

export function codexContextOf(modelId: string | undefined) {
  return codexModelOf(modelId).contextWindow;
}

export function codexNameOf(modelId: string | undefined) {
  const model = CODEX_MODELS.find((item) => item.id === (modelId ?? "default"));
  return model ? model.family : (modelId ?? "");
}

export function isCodexEffort(value: string | undefined): value is CodexEffort {
  return (CODEX_EFFORTS as readonly (string | undefined)[]).includes(value);
}

export function codexEffortOf(value: string | undefined) {
  return isCodexEffort(value) ? value : undefined;
}
