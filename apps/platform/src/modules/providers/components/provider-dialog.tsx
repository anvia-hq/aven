import { bedrockRegionOf, vertexPartsOf } from "@aven/protocol/providers";
import { useState } from "react";

import { Button } from "@aven/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aven/ui/dialog";
import { Form } from "@aven/ui/form";
import { TextField } from "@aven/ui/text-field";

import { useProviderForm } from "../hooks/use-provider-form";
import { PROVIDER_LABELS } from "../types";
import type { CompatiblePreset, Provider, ProviderKind } from "../types";
import { ModelField } from "./model-field";

const keyPlaceholders: Record<ProviderKind, string> = {
  openai: "sk-…",
  anthropic: "sk-ant-…",
  gemini: "AIza…",
  bedrock: "Amazon Bedrock API key",
  vertex: "Service account JSON key, or an access token",
  azure: "Key 1 or Key 2 from the resource",
  "openai-compatible": "sk-…",
  "claude-subscription": "sk-ant-oat01-…",
  "codex-subscription": "sk-…",
};

const modelWaiting: Record<ProviderKind, string> = {
  openai: "Enter your API key to load models",
  anthropic: "Enter your API key to load models",
  gemini: "Enter your API key to load models",
  bedrock: "Enter the region and key to load models",
  vertex: "Enter the project, location and credential to load models",
  azure: "Enter the resource URL and key to load deployments",
  "openai-compatible": "Enter the base URL to load models",
  "claude-subscription": "The models your subscription runs",
  "codex-subscription": "The models your key runs",
};

const SUBSCRIPTION_HELP: Partial<Record<ProviderKind, string>> = {
  "claude-subscription":
    "Run `claude setup-token` on your own computer and sign in: it prints a token that starts with sk-ant-oat01-. You need Claude Code and a Claude Pro or Max subscription. Every thread you start on it uses this token.",
  "codex-subscription":
    "Create a key at platform.openai.com/api-keys. The runner also needs the Codex CLI, from the SDK's install or from CODEX_PATH. Every thread you start on it uses this key.",
};

function SubscriptionHelp({ kind }: { kind: ProviderKind }) {
  const text = SUBSCRIPTION_HELP[kind];

  if (!text) return null;

  return <p className="text-xs leading-relaxed text-muted-foreground">{text}</p>;
}

type Props = {
  kind: ProviderKind;
  provider?: Provider;
  preset?: CompatiblePreset;
  label: string;
  prominent?: boolean;
};

export function ProviderDialog({ kind, provider, preset, label, prominent = false }: Props) {
  const [open, setOpen] = useState(false);
  const form = useProviderForm(kind, provider, () => setOpen(false), preset);
  const { compatible, azure, bedrock, vertex, subscription } = form;
  const keyOptional = compatible && preset?.needsKey !== true;
  const keyLabel =
    (vertex && "Credential") ||
    (subscription && (kind === "claude-subscription" ? "Setup token" : "API key")) ||
    (keyOptional ? "API key (optional)" : "API key");
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
      <DialogTrigger
        render={
          <Button variant={prominent ? "default" : "outline"} size={prominent ? "lg" : "xs"} />
        }
      >
        {label}
      </DialogTrigger>
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
          {subscription && <SubscriptionHelp kind={kind} />}
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
            <Button
              type="submit"
              disabled={form.submitting || ((modelRequired || subscription) && !form.modelId)}
            >
              {editing ? "Save changes" : "Add provider"}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
