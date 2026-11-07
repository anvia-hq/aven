import { bedrockBaseUrl, vertexBaseUrl } from "@aven/protocol/providers";
import { useRef, useState, type FormEvent } from "react";

import { errorMessage } from "@/lib/api";

import {
  PROVIDER_LABELS,
  type CompatiblePreset,
  type ModelsState,
  type Provider,
  type ProviderKind,
} from "../types";
import { useProviders } from "./use-providers";

const SOURCE_FIELDS = new Set(["apiKey", "baseUrl", "region", "project", "location"]);
const AUTO_LOAD_DELAY_MS = 600;

export function useProviderForm(
  kind: ProviderKind,
  provider: Provider | undefined,
  onDone: () => void,
  preset?: CompatiblePreset,
) {
  const [submitting, setSubmitting] = useState(false);
  const [modelsState, setModelsState] = useState<ModelsState>({ status: "idle", models: null });
  const [modelId, setModelId] = useState(provider?.modelId ?? "");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(0);
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
    clearTimeout(timer.current);
    latest.current += 1;
    setModelsState({ status: "idle", models: null });
    setModelId(provider?.modelId ?? "");
  }

  async function loadModels() {
    const apiKey = readTrimmedField("apiKey");
    const baseUrl = readBaseUrl();
    const saved = provider !== undefined && !apiKey;
    const ready =
      saved || ((apiKey || compatible) && (baseUrl || !(compatible || azure || bedrock || vertex)));
    if (!ready) {
      latest.current += 1;
      setModelsState({ status: "idle", models: null });
      return;
    }
    const request = ++latest.current;
    setModelsState((current) => ({ ...current, status: "loading", error: undefined }));
    try {
      const listed = saved
        ? await listSavedModels(provider)
        : await listModels({ kind, apiKey, baseUrl });
      if (request !== latest.current) return;
      const list = [...new Set([provider?.modelId ?? "", ...listed])].filter(Boolean).sort();
      setModelsState({
        status: list.length ? "ready" : "error",
        models: list,
        error: list.length ? undefined : "No models found",
      });
      setModelId((current) => (list.includes(current) ? current : (list[0] ?? "")));
    } catch (failure) {
      if (request !== latest.current) return;
      setModelsState((current) => ({ ...current, status: "error", error: errorMessage(failure) }));
    }
  }

  function scheduleLoad(event: FormEvent<HTMLFormElement>) {
    const name = (event.target as HTMLInputElement).name;
    if (!SOURCE_FIELDS.has(name)) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void loadModels(), AUTO_LOAD_DELAY_MS);
  }

  function loadOnOpen(open: boolean) {
    if (!open) return;
    timer.current = setTimeout(() => void loadModels(), 0);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const chosenModel = modelId || undefined;
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
    modelsState,
    modelId,
    submitting,
    selectModel: setModelId,
    scheduleLoad,
    loadOnOpen,
    reset,
    submit,
  };
}
