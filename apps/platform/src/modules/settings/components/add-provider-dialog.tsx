import { Plus } from "@mynaui/icons-react";
import { useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/dialog";
import { Form } from "@/components/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";
import { TextField } from "@/components/text-field";

import { useProviders } from "../hooks/use-providers";
import { PROVIDER_KINDS, PROVIDER_LABELS, type ProviderKind } from "../types";

const kindItems = PROVIDER_KINDS.map((kind) => ({ value: kind, label: PROVIDER_LABELS[kind] }));

export function AddProviderDialog() {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [kind, setKind] = useState<ProviderKind>("openai");
  const [models, setModels] = useState<string[] | null>(null);
  const [modelId, setModelId] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { create, listModels } = useProviders();
  const compatible = kind === "openai-compatible";
  let loadModelsLabel = models ? "Reload" : "Load models";
  if (loadingModels) loadModelsLabel = "Loading…";

  const field = (name: string) =>
    String(new FormData(formRef.current ?? undefined).get(name) ?? "").trim() || undefined;

  function reset() {
    setKind("openai");
    setModels(null);
    setModelId("");
  }

  function changeKind(next: ProviderKind) {
    setKind(next);
    setModels(null);
    setModelId("");
  }

  // Fetches `<provider>/models` with whatever key and URL are typed so far.
  async function loadModels() {
    setLoadingModels(true);
    const list = await listModels({ kind, apiKey: field("apiKey"), baseUrl: field("baseUrl") });
    setLoadingModels(false);
    if (list) {
      setModels(list);
      setModelId((current) => (list.includes(current) ? current : (list[0] ?? "")));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const created = await create({
      kind,
      name: field("name") ?? PROVIDER_LABELS[kind],
      apiKey: field("apiKey"),
      baseUrl: compatible ? field("baseUrl") : undefined,
      modelId: (models ? modelId : field("modelId")) || undefined,
    });
    setSubmitting(false);
    if (created) {
      setOpen(false);
      reset();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button />}>
        <Plus /> Add provider
      </DialogTrigger>
      <DialogContent>
        <Form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add provider</DialogTitle>
            <DialogDescription>
              Keys are encrypted and never shown again. They follow you across workspaces.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1 text-sm">
            <span>Type</span>
            <Select
              items={kindItems}
              value={kind}
              onValueChange={(value) => value && changeKind(value as ProviderKind)}
            >
              <SelectTrigger aria-label="Provider type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {kindItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <TextField label="Name" name="name" placeholder={PROVIDER_LABELS[kind]} />
          {compatible && (
            <TextField
              label="Base URL"
              name="baseUrl"
              type="url"
              required
              placeholder="http://localhost:11434/v1"
            />
          )}
          <TextField
            label={compatible ? "API key (optional)" : "API key"}
            name="apiKey"
            type="password"
            autoComplete="off"
            required={!compatible}
            placeholder={kind === "anthropic" ? "sk-ant-…" : "sk-…"}
          />
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              {models ? (
                <div className="flex flex-col gap-1 text-sm">
                  <span>Model</span>
                  <Select
                    items={models.map((id) => ({ value: id, label: id }))}
                    value={modelId}
                    onValueChange={(value) => value && setModelId(value)}
                  >
                    <SelectTrigger aria-label="Model" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((id) => (
                        <SelectItem key={id} value={id}>
                          {id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <TextField
                  label={compatible ? "Model" : "Model (optional)"}
                  name="modelId"
                  required={compatible}
                  placeholder={compatible ? "llama3.1" : "Provider default"}
                />
              )}
            </div>
            <Button type="button" variant="outline" disabled={loadingModels} onClick={loadModels}>
              {loadModelsLabel}
            </Button>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              Add provider
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
