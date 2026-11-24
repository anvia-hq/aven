import { bedrockRegionOf, vertexPartsOf } from "@aven/protocol/providers";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { useId, useState } from "react";
import type { ComponentProps } from "react";

import { Button } from "@aven/ui/button";
import { Input } from "@aven/ui/input";
import { Label } from "@aven/ui/label";

import { PROVIDER_LABELS } from "../types";
import type { CompatiblePreset, ModelsState, Provider, ProviderKind } from "../types";
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
  "codex-subscription": "",
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
  "codex-subscription": "The models your ChatGPT plan runs",
};

const SUBSCRIPTION_HELP: Partial<Record<ProviderKind, string>> = {
  "claude-subscription":
    "Run `claude setup-token` on your own computer and sign in: it prints a token that starts with sk-ant-oat01-. You need Claude Code and a Claude Pro or Max subscription. Every thread you start on it uses this token.",
};

function SubscriptionHelp({ kind }: { kind: ProviderKind }) {
  const text = SUBSCRIPTION_HELP[kind];

  if (!text) return null;

  return <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-2">{text}</p>;
}

function FormField({
  label,
  ...props
}: ComponentProps<typeof Input> & {
  label: string;
}) {
  const id = useId();

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <Input id={id} {...props} />
    </div>
  );
}

type Props = {
  kind: ProviderKind;
  provider?: Provider;
  preset?: CompatiblePreset;
  compatible: boolean;
  azure: boolean;
  bedrock: boolean;
  vertex: boolean;
  subscription: boolean;
  modelsState: ModelsState;
  modelId: string;
  onSelectModel: (modelId: string) => void;
  layout?: "stack" | "grid";
};

export function ProviderFields({
  kind,
  provider,
  preset,
  compatible,
  azure,
  bedrock,
  vertex,
  subscription,
  modelsState,
  modelId,
  onSelectModel,
  layout = "stack",
}: Props) {
  const [showKey, setShowKey] = useState(false);
  const keyId = useId();
  const editing = provider !== undefined;
  const keyOptional = compatible && preset?.needsKey !== true;
  let keyLabel = keyOptional ? "API key (optional)" : "API key";

  if (vertex) keyLabel = "Credential";
  else if (subscription) keyLabel = kind === "claude-subscription" ? "Setup token" : "API key";

  const vertexParts = vertexPartsOf(provider?.baseUrl);
  const wrapperClass =
    layout === "grid"
      ? "grid min-w-0 gap-x-4 gap-y-3.5 sm:grid-cols-2"
      : "flex min-w-0 flex-col gap-4";
  const keyPlaceholder =
    editing && provider.keyHint
      ? `Leave blank to keep …${provider.keyHint}`
      : (preset?.keyPlaceholder ?? keyPlaceholders[kind]);
  let waiting = modelWaiting[kind];

  if (preset) {
    waiting = preset.needsKey ? "Enter your API key to load models" : "Loading models…";
  }

  return (
    <div className={wrapperClass}>
      {((compatible && !preset) || bedrock || vertex) && (
        <FormField
          label="Name"
          name="name"
          defaultValue={provider?.name}
          placeholder={PROVIDER_LABELS[kind]}
        />
      )}
      {((compatible && !preset) || azure) && (
        <FormField
          label={azure ? "Resource URL" : "Base URL"}
          name="baseUrl"
          type="url"
          required
          defaultValue={provider?.baseUrl ?? undefined}
          placeholder={azure ? "https://my-resource.openai.azure.com" : "http://localhost:11434/v1"}
        />
      )}
      {bedrock && (
        <FormField
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
          <FormField
            label="Project ID"
            name="project"
            required
            pattern="[a-z][a-z0-9\-]{4,28}[a-z0-9]"
            defaultValue={vertexParts?.project}
            placeholder="my-project-123"
          />
          <FormField
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
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={keyId} className="text-xs font-medium text-muted-foreground">
          {keyLabel}
        </Label>
        <div className="relative flex items-center">
          <Input
            id={keyId}
            name="apiKey"
            type={showKey ? "text" : "password"}
            autoComplete="off"
            className="pr-8"
            required={(!compatible || preset?.needsKey === true) && !editing}
            placeholder={keyPlaceholder}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={showKey ? "Hide value" : "Reveal value"}
            onClick={() => setShowKey((current) => !current)}
            className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:bg-transparent hover:text-foreground"
          >
            {showKey ? <IconEyeOff className="size-3.5" /> : <IconEye className="size-3.5" />}
          </Button>
        </div>
      </div>
      <ModelField
        label={kind === "azure" ? "Deployment" : "Model"}
        state={modelsState}
        value={modelId}
        onChange={onSelectModel}
        waiting={waiting}
      />
    </div>
  );
}
