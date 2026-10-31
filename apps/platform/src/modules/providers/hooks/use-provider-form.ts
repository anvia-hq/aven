import { useRef, useState, type FormEvent } from "react";

import { PROVIDER_LABELS, type Provider, type ProviderKind } from "../types";
import { useProviders } from "./use-providers";

// The state behind the provider dialog for one kind: the model list loaded for it, and
// submitting, which adds a provider or, given one, changes it. Text fields are uncontrolled; they
// are read from the form when needed.
export function useProviderForm(
  kind: ProviderKind,
  provider: Provider | undefined,
  onDone: () => void,
) {
  const [submitting, setSubmitting] = useState(false);
  const [models, setModels] = useState<string[] | null>(null);
  const [modelId, setModelId] = useState(provider?.modelId ?? "");
  const [loadingModels, setLoadingModels] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { create, update, listModels, listSavedModels } = useProviders();
  const compatible = kind === "openai-compatible";
  const azure = kind === "azure";

  const readTrimmedField = (name: string) =>
    String(new FormData(formRef.current ?? undefined).get(name) ?? "").trim() || undefined;

  // A model list belongs to one key and URL, so closing the dialog drops it.
  function reset() {
    setModels(null);
    setModelId(provider?.modelId ?? "");
  }

  // Fetches `<provider>/models` with whatever key and URL are typed so far; an edit with no new
  // key asks with the stored one.
  async function loadModels() {
    setLoadingModels(true);
    const apiKey = readTrimmedField("apiKey");
    const list =
      provider && !apiKey
        ? await listSavedModels(provider)
        : await listModels({ kind, apiKey, baseUrl: readTrimmedField("baseUrl") });
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
    const name = readTrimmedField("name") ?? provider?.name ?? PROVIDER_LABELS[kind];
    const baseUrl = compatible || azure ? readTrimmedField("baseUrl") : undefined;
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
