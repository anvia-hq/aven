import { bedrockRegionOf } from "@aven/protocol/providers";
import { useState } from "react";

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
import { TextField } from "@/components/text-field";

import { useProviderForm } from "../hooks/use-provider-form";
import { PROVIDER_LABELS, type Provider, type ProviderKind } from "../types";
import { ModelField } from "./model-field";

function loadModelsLabel(loading: boolean, loaded: boolean) {
  if (loading) return "Loading…";
  return loaded ? "Reload" : "Load models";
}

const keyPlaceholders: Record<ProviderKind, string> = {
  openai: "sk-…",
  anthropic: "sk-ant-…",
  gemini: "AIza…",
  bedrock: "Amazon Bedrock API key",
  azure: "Key 1 or Key 2 from the resource",
  "openai-compatible": "sk-…",
};

const modelPlaceholders: Partial<Record<ProviderKind, string>> = {
  bedrock: "openai.gpt-oss-120b",
  "openai-compatible": "llama3.1",
};

type Props = {
  kind: ProviderKind;
  /** Given one, the dialog edits it; without, it adds a provider. */
  provider?: Provider;
  /** The trigger's label: "Add" for a kind with many, "Set up" or "Edit" for one with a single. */
  label: string;
};

export function ProviderDialog({ kind, provider, label }: Props) {
  const [open, setOpen] = useState(false);
  const form = useProviderForm(kind, provider, () => setOpen(false));
  const { compatible, azure, bedrock } = form;
  const editing = provider !== undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="xs" />}>{label}</DialogTrigger>
      <DialogContent>
        <Form ref={form.formRef} onSubmit={form.submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit" : label} {PROVIDER_LABELS[kind]}
            </DialogTitle>
            <DialogDescription>
              Keys are encrypted and never shown again. They follow you across workspaces.
            </DialogDescription>
          </DialogHeader>
          {(compatible || bedrock) && (
            <TextField
              label="Name"
              name="name"
              defaultValue={provider?.name}
              placeholder={PROVIDER_LABELS[kind]}
            />
          )}
          {(compatible || azure) && (
            <TextField
              label={azure ? "Resource URL" : "Base URL"}
              name="baseUrl"
              type="url"
              required
              defaultValue={provider?.baseUrl ?? undefined}
              placeholder={
                azure ? "https://my-resource.openai.azure.com" : "http://localhost:11434/v1"
              }
            />
          )}
          {bedrock && (
            <TextField
              label="Region"
              name="region"
              required
              pattern="[a-z]{2}(-[a-z]+)+-[0-9]+"
              defaultValue={bedrockRegionOf(provider?.baseUrl) ?? undefined}
              placeholder="us-east-1"
            />
          )}
          <TextField
            label={compatible ? "API key (optional)" : "API key"}
            name="apiKey"
            type="password"
            autoComplete="off"
            required={!compatible && !editing}
            placeholder={
              editing && provider.keyHint
                ? `Leave blank to keep …${provider.keyHint}`
                : keyPlaceholders[kind]
            }
          />
          {azure ? (
            // Azure names models by deployment, and has no list to load.
            <TextField
              label="Deployment name"
              name="modelId"
              required
              defaultValue={provider?.modelId ?? undefined}
              placeholder="my-gpt-deployment"
            />
          ) : (
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <ModelField
                  models={form.models}
                  value={form.modelId}
                  onChange={form.selectModel}
                  required={compatible || bedrock}
                  defaultValue={provider?.modelId ?? undefined}
                  placeholder={modelPlaceholders[kind] ?? "Provider default"}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={form.loadingModels}
                onClick={form.loadModels}
              >
                {loadModelsLabel(form.loadingModels, form.models !== null)}
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={form.submitting}>
              {editing ? "Save changes" : "Add provider"}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
