import { useRef, useState, type FormEvent } from "react";

import { PROVIDER_LABELS, type ProviderKind } from "../types";
import { useProviders } from "./use-providers";

// The state behind the add-provider dialog: the chosen kind, the model list loaded for it, and
// submitting. Text fields are uncontrolled; they are read from the form when needed.
export function useAddProviderForm(onAdded: () => void) {
  const [submitting, setSubmitting] = useState(false);
  const [kind, setKind] = useState<ProviderKind>("openai");
  const [models, setModels] = useState<string[] | null>(null);
  const [modelId, setModelId] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { create, listModels } = useProviders();
  const compatible = kind === "openai-compatible";

  const readTrimmedField = (name: string) =>
    String(new FormData(formRef.current ?? undefined).get(name) ?? "").trim() || undefined;

  // A model list belongs to one kind and key, so changing the kind (or closing) drops it.
  function reset(next: ProviderKind = "openai") {
    setKind(next);
    setModels(null);
    setModelId("");
  }

  // Fetches `<provider>/models` with whatever key and URL are typed so far.
  async function loadModels() {
    setLoadingModels(true);
    const list = await listModels({
      kind,
      apiKey: readTrimmedField("apiKey"),
      baseUrl: readTrimmedField("baseUrl"),
    });
    setLoadingModels(false);
    if (list) {
      setModels(list);
      setModelId((current) => (list.includes(current) ? current : (list[0] ?? "")));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const created = await create({
      kind,
      name: readTrimmedField("name") ?? PROVIDER_LABELS[kind],
      apiKey: readTrimmedField("apiKey"),
      baseUrl: compatible ? readTrimmedField("baseUrl") : undefined,
      modelId: (models ? modelId : readTrimmedField("modelId")) || undefined,
    });
    setSubmitting(false);
    if (created) {
      reset();
      onAdded();
    }
  }

  return {
    formRef,
    kind,
    compatible,
    models,
    modelId,
    loadingModels,
    submitting,
    changeKind: reset,
    selectModel: setModelId,
    loadModels,
    reset,
    submit,
  };
}
