import { bedrockRegionOf, vertexPartsOf } from "@aven/protocol/providers";
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
import type { CompatiblePreset } from "../types";

const keyPlaceholders: Record<ProviderKind, string> = {
  openai: "sk-…",
  anthropic: "sk-ant-…",
  gemini: "AIza…",
  bedrock: "Amazon Bedrock API key",
  vertex: "Service account JSON key, or an access token",
  azure: "Key 1 or Key 2 from the resource",
  "openai-compatible": "sk-…",
  codex: "",
};

const modelWaiting: Record<ProviderKind, string> = {
  openai: "Enter your API key to load models",
  anthropic: "Enter your API key to load models",
  gemini: "Enter your API key to load models",
  bedrock: "Enter the region and key to load models",
  vertex: "Enter the project, location and credential to load models",
  azure: "Enter the resource URL and key to load deployments",
  "openai-compatible": "Enter the base URL to load models",
  codex: "Codex lists its own models",
};

type Props = {
  kind: ProviderKind;
  provider?: Provider;
  preset?: CompatiblePreset;
  label: string;
};

export function ProviderDialog({ kind, provider, preset, label }: Props) {
  const [open, setOpen] = useState(false);
  const form = useProviderForm(kind, provider, () => setOpen(false), preset);
  const { compatible, azure, bedrock, vertex } = form;
  const keyOptional = compatible && preset?.needsKey !== true;
  const keyLabel = (vertex && "Credential") || (keyOptional ? "API key (optional)" : "API key");
  const vertexParts = vertexPartsOf(provider?.baseUrl);
  const modelRequired = compatible || bedrock || azure || vertex;
  const editing = provider !== undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        form.loadOnOpen(next);
        if (!next) {
          form.reset();
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="xs" />}>{label}</DialogTrigger>
      <DialogContent>
        <Form
          ref={form.formRef}
          onSubmit={form.submit}
          onChange={form.scheduleLoad}
          className="flex min-w-0 flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit" : label} {preset?.name ?? PROVIDER_LABELS[kind]}
            </DialogTitle>
            <DialogDescription>
              Keys are encrypted and never shown again. They follow you across workspaces.
            </DialogDescription>
          </DialogHeader>
          {((compatible && !preset) || bedrock || vertex) && (
            <TextField
              label="Name"
              name="name"
              defaultValue={provider?.name}
              placeholder={PROVIDER_LABELS[kind]}
            />
          )}
          {((compatible && !preset) || azure) && (
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
          {vertex && (
            <>
              <TextField
                label="Project ID"
                name="project"
                required
                pattern="[a-z][a-z0-9\-]{4,28}[a-z0-9]"
                defaultValue={vertexParts?.project}
                placeholder="my-project-123"
              />
              <TextField
                label="Location"
                name="location"
                required
                pattern="global|[a-z]+(-[a-z0-9]+)+"
                defaultValue={vertexParts?.location ?? "global"}
                placeholder="global"
              />
            </>
          )}
          <TextField
            label={keyLabel}
            name="apiKey"
            type="password"
            autoComplete="off"
            required={(!compatible || preset?.needsKey === true) && !editing}
            placeholder={
              editing && provider.keyHint
                ? `Leave blank to keep …${provider.keyHint}`
                : (preset?.keyPlaceholder ?? keyPlaceholders[kind])
            }
          />
          <ModelField
            label={kind === "azure" ? "Deployment" : "Model"}
            state={form.modelsState}
            value={form.modelId}
            onChange={form.selectModel}
            waiting={modelWaiting[kind]}
          />
          <DialogFooter>
            <Button type="submit" disabled={form.submitting || (modelRequired && !form.modelId)}>
              {editing ? "Save changes" : "Add provider"}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
