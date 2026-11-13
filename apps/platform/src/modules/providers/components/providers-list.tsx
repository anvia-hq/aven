import { PROVIDERS } from "@aven/protocol/runtime-wire";
import type { ReactNode } from "react";

import { Badge } from "@aven/ui/badge";

import { COMPATIBLE_PRESETS, presetOf } from "../presets";
import { useProviders } from "../hooks/use-providers";
import { useProvidersModels } from "../hooks/use-provider-models";
import { PROVIDER_DESCRIPTIONS, PROVIDER_LABELS } from "../types";
import type { CompatiblePreset, Provider, ProviderKind } from "../types";
import { ProviderActions } from "./provider-actions";
import { ProviderDialog } from "./provider-dialog";
import { ProviderLogo } from "./provider-logo";

const MANY = new Set<ProviderKind>(["openai-compatible", "bedrock", "vertex"]);

const connectedPresets = (providers: Provider[]) =>
  new Set(providers.map((provider) => presetOf(provider)?.id));

type Row = {
  key: string;
  kind: ProviderKind;
  preset?: CompatiblePreset;
  title: string;
  description: string;
  label: string;
};

const detail = (provider: Provider, label: string | undefined) =>
  [provider.baseUrl, label ?? provider.modelId, provider.keyHint && `…${provider.keyHint}`]
    .filter(Boolean)
    .join(" · ");

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t py-6 md:py-8">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <ul className="flex flex-col divide-y">{children}</ul>
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

export function ProvidersList() {
  const { providers, loaded } = useProviders();
  const { byProvider } = useProvidersModels(providers.map((item) => item.id));

  if (!loaded) return null;

  const available = PROVIDERS.filter(
    (kind) => MANY.has(kind) || !providers.some((provider) => provider.kind === kind),
  );

  const taken = connectedPresets(providers);
  const presets = COMPATIBLE_PRESETS.filter((preset) => !taken.has(preset.id));
  const kindRow = (kind: ProviderKind): Row => ({
    key: kind,
    kind,
    title: PROVIDER_LABELS[kind],
    description: PROVIDER_DESCRIPTIONS[kind],
    label: MANY.has(kind) ? "Add" : "Set up",
  });
  const rows: Row[] = [
    ...available.filter((kind) => kind !== "openai-compatible").map(kindRow),
    ...presets.map((preset): Row => ({
      key: preset.id,
      kind: "openai-compatible",
      preset,
      title: preset.name,
      description: preset.description,
      label: "Set up",
    })),
    ...available.filter((kind) => kind === "openai-compatible").map(kindRow),
  ];

  return (
    <div className="flex flex-col">
      {providers.length > 0 && (
        <Group title="Connected">
          {providers.map((provider) => (
            <li
              key={provider.id}
              aria-label={provider.name}
              className="flex items-center gap-3.5 py-3.5"
            >
              <Tile kind={provider.kind} baseUrl={provider.baseUrl} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{provider.name}</span>
                  {provider.isDefault && <Badge variant="secondary">Default</Badge>}
                </div>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {detail(
                    provider,
                    provider.modelId
                      ? byProvider[provider.id]?.labels?.[provider.modelId]
                      : undefined,
                  )}
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
        {rows.map((row) => (
          <li key={row.key} aria-label={row.title} className="flex items-center gap-3.5 py-3.5">
            <Tile kind={row.kind} preset={row.preset?.id} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2.5">
              <span className="text-sm font-medium">{row.title}</span>
              <span className="truncate text-xs text-muted-foreground">{row.description}</span>
            </div>
            <ProviderDialog kind={row.kind} preset={row.preset} label={row.label} />
          </li>
        ))}
      </Group>
    </div>
  );
}
