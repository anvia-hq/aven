import { PROVIDERS } from "@aven/protocol/runtime-wire";
import type { ReactNode } from "react";

import { Badge } from "@/components/badge";

import { COMPATIBLE_PRESETS, presetOf, type CompatiblePreset } from "../presets";
import { useProviders } from "../hooks/use-providers";
import { PROVIDER_DESCRIPTIONS, PROVIDER_LABELS, type Provider, type ProviderKind } from "../types";
import { ProviderActions } from "./provider-actions";
import { ProviderDialog } from "./provider-dialog";
import { ProviderLogo } from "./provider-logo";

// OpenAI, Anthropic, Gemini and Azure have one credential each; a server, a Bedrock region or a Vertex
// AI project can be added as often as the person has them.
const MANY = new Set<ProviderKind>(["openai-compatible", "bedrock", "vertex"]);

// A service with its own panel has one credential, like OpenAI: the panel goes once it is set up.
const connectedPresets = (providers: Provider[]) =>
  new Set(providers.map((provider) => presetOf(provider)?.id));

const detail = (provider: Provider) =>
  [provider.baseUrl, provider.modelId, provider.keyHint && `…${provider.keyHint}`]
    .filter(Boolean)
    .join(" · ");

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
      <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card/50">
        {children}
      </ul>
    </section>
  );
}

function Tile({
  kind,
  baseUrl,
  preset,
}: {
  kind: ProviderKind;
  baseUrl?: string | null;
  preset?: CompatiblePreset["id"];
}) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
      <ProviderLogo kind={kind} baseUrl={baseUrl} preset={preset} />
    </span>
  );
}

// What is set up comes first, with what each one runs; below it, what can still be added. OpenAI,
// Anthropic, Gemini and Azure have one credential each; any number of OpenAI-compatible servers and
// Bedrock regions can be added.
export function ProvidersList() {
  const { providers, loaded } = useProviders();

  if (!loaded) return null;

  const available = PROVIDERS.filter(
    (kind) => MANY.has(kind) || !providers.some((provider) => provider.kind === kind),
  );

  const taken = connectedPresets(providers);
  const presets = COMPATIBLE_PRESETS.filter((preset) => !taken.has(preset.id));

  return (
    <div className="flex flex-col gap-8">
      {providers.length > 0 && (
        <Group title="Connected">
          {providers.map((provider) => (
            <li
              key={provider.id}
              aria-label={provider.name}
              className="flex items-center gap-3.5 px-4 py-3.5"
            >
              <Tile kind={provider.kind} baseUrl={provider.baseUrl} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{provider.name}</span>
                  {provider.isDefault && <Badge variant="secondary">Default</Badge>}
                </div>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {detail(provider)}
                </p>
              </div>
              <ProviderActions
                provider={provider}
                edit={
                  provider.kind === "openai-compatible" && !presetOf(provider) ? undefined : (
                    <ProviderDialog
                      kind={provider.kind}
                      provider={provider}
                      preset={presetOf(provider)}
                      label="Edit"
                    />
                  )
                }
              />
            </li>
          ))}
        </Group>
      )}
      <Group title={providers.length > 0 ? "Add a provider" : "Set up a provider"}>
        {available.map((kind) => (
          <li
            key={kind}
            aria-label={PROVIDER_LABELS[kind]}
            className="flex items-center gap-3.5 px-4 py-3.5"
          >
            <Tile kind={kind} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2.5">
              <span className="text-sm font-medium">{PROVIDER_LABELS[kind]}</span>
              <span className="truncate text-xs text-muted-foreground">
                {PROVIDER_DESCRIPTIONS[kind]}
              </span>
            </div>
            <ProviderDialog kind={kind} label={MANY.has(kind) ? "Add" : "Set up"} />
          </li>
        ))}
        {presets.map((preset) => (
          <li
            key={preset.id}
            aria-label={preset.name}
            className="flex items-center gap-3.5 px-4 py-3.5"
          >
            <Tile kind="openai-compatible" preset={preset.id} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2.5">
              <span className="text-sm font-medium">{preset.name}</span>
              <span className="truncate text-xs text-muted-foreground">{preset.description}</span>
            </div>
            <ProviderDialog kind="openai-compatible" preset={preset} label="Set up" />
          </li>
        ))}
      </Group>
    </div>
  );
}
