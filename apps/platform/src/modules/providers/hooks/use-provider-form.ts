import { bedrockBaseUrl, vertexBaseUrl } from "@aven/protocol/providers";
import { useRef, useState, type FormEvent } from "react";

import type { CompatiblePreset } from "../presets";
import { PROVIDER_LABELS, type Provider, type ProviderKind } from "../types";
import { useProviders } from "./use-providers";

export function useProviderForm(
  kind: ProviderKind,
  provider: Provider | undefined,
  onDone: () => void,
  preset?: CompatiblePreset,
) {
  const [submitting, setSubmitting] = useState(false);
  const [models, setModels] = useState<string[] | null>(null);
  const [modelId, setModelId] = useState(provider?.modelId ?? "");
  const [loadingModels, setLoadingModels] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { create, update, listModels, listSavedModels } = useProviders();
  const compatible = kind === "openai-compatible";
  const azure = kind === "azure";
  const bedrock = kind === "bedrock";
  const vertex = kind === "vertex";

  const readTrimmedField = (name: string) =>
    String(new FormData(formRef.current ?? undefined).get(name) ?? "").trim() || undefined;

  function readBaseUrl() {
    if (bedrock) {
      const region = readTrimmedField("region");
      return region ? bedrockBaseUrl(region) : undefined;
    }
    if (vertex) {
      const project = readTrimmedField("project");
      const location = readTrimmedField("location");
      return project && location ? vertexBaseUrl(project, location) : undefined;
    }
    if (preset) return preset.baseUrl;
    return compatible || azure ? readTrimmedField("baseUrl") : undefined;
  }

  function reset() {
    setModels(null);
    setModelId(provider?.modelId ?? "");
  }

  async function loadModels() {
    setLoadingModels(true);
    const apiKey = readTrimmedField("apiKey");
    const list =
      provider && !apiKey
        ? await listSavedModels(provider)
        : await listModels({ kind, apiKey, baseUrl: readBaseUrl() });
    setLoadingModels(false);
    if (list) {
      setModels(list);
      setModelId((current) => (list.includes(current) ? current : (list[0] ?? "")));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const chosenModel = (models ? modelId : readTrimmedField("modelId")) || undefined;
    const name =
      readTrimmedField("name") ?? provider?.name ?? preset?.name ?? PROVIDER_LABELS[kind];
    const baseUrl = readBaseUrl();
    const apiKey = readTrimmedField("apiKey");
    const done = provider
      ? await update(provider, { name, apiKey, baseUrl, modelId: chosenModel ?? null })
      : await create({ kind, name, apiKey, baseUrl, modelId: chosenModel });
    setSubmitting(false);
    if (done) {
      reset();
      onDone();
    }
  }

  return {
    formRef,
    compatible,
    azure,
    bedrock,
    vertex,
    models,
    modelId,
    loadingModels,
    submitting,
    selectModel: setModelId,
    loadModels,
    reset,
    submit,
  };
}
