import { PROVIDERS } from "@aven/protocol/runtime-wire";
import { useState } from "react";
import type { ReactNode } from "react";

import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";
import { Input } from "@aven/ui/input";

import { usePlatformConfig } from "@/modules/platform/hooks/use-platform-config";
import { COMPATIBLE_PRESETS, presetOf } from "../presets";
import { useProviders } from "../hooks/use-providers";
import { useProvidersModels } from "../hooks/use-provider-models";
import { isSubscription, PROVIDER_DESCRIPTIONS, PROVIDER_LABELS } from "../types";
import type { CompatiblePreset, Provider, ProviderKind } from "../types";
import { ProviderActions } from "./provider-actions";
import { ProviderDialog } from "./provider-dialog";
import { ProviderLogo } from "./provider-logo";

const MANY = new Set<ProviderKind>(["openai-compatible", "bedrock", "vertex"]);
const FEATURED: ProviderKind[] = ["claude-subscription", "codex-subscription"];
const COLLAPSED_ROWS = 5;

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

function Highlight({
  kind,
  provider,
  modelLabel,
}: {
  kind: ProviderKind;
  provider?: Provider;
  modelLabel?: string;
}) {
  return (
    <li
      aria-label={PROVIDER_LABELS[kind]}
      className="relative flex flex-col gap-4 overflow-hidden rounded-xl bg-card p-5 shadow-sm ring-1 ring-foreground/10 sm:p-6"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 size-48 rounded-full bg-primary/[0.07] blur-2xl"
      />
      <div className="relative flex items-center gap-3.5">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-muted/70 ring-1 ring-foreground/10">
          <ProviderLogo kind={kind} size="lg" />
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-lg font-semibold tracking-tight">{PROVIDER_LABELS[kind]}</span>
          {provider && <Badge variant="outline">Connected</Badge>}
          {provider?.isDefault && <Badge variant="secondary">Default</Badge>}
        </span>
      </div>
      <p className="relative max-w-prose text-sm leading-relaxed text-pretty text-muted-foreground">
        {PROVIDER_DESCRIPTIONS[kind]}
      </p>
      {provider ? (
        <div className="relative mt-auto flex flex-col gap-2 border-t pt-3">
          <p className="truncate font-mono text-xs text-muted-foreground">
            {detail(provider, modelLabel)}
          </p>
          <div className="flex flex-wrap items-center gap-1">
            <ProviderActions
              provider={provider}
              edit={<ProviderDialog kind={kind} provider={provider} label="Edit" />}
            />
          </div>
        </div>
      ) : (
        <div className="relative mt-auto flex items-center pt-1">
          <ProviderDialog kind={kind} label="Set up" prominent />
        </div>
      )}
    </li>
  );
}

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

const OFFERED_BACKEND: Partial<Record<ProviderKind, "claudeBackend" | "codexBackend">> = {
  "claude-subscription": "claudeBackend",
  "codex-subscription": "codexBackend",
};

export function ProvidersList() {
  const { providers, loaded } = useProviders();
  const { byProvider } = useProvidersModels(providers.map((item) => item.id));
  const { config } = usePlatformConfig();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  if (!loaded) return null;

  const offered = (kind: ProviderKind) => {
    const flag = OFFERED_BACKEND[kind];

    return !flag || config?.[flag] !== false;
  };
  const available = PROVIDERS.filter(
    (kind) =>
      offered(kind) && (MANY.has(kind) || !providers.some((provider) => provider.kind === kind)),
  );

  const taken = connectedPresets(providers);
  const presets = COMPATIBLE_PRESETS.filter((preset) => !taken.has(preset.id));
  const featured = FEATURED.filter(offered);
  const availableRows = available.filter((kind) => !featured.includes(kind));
  const connected = providers.filter((provider) => !featured.includes(provider.kind));
  const kindRow = (kind: ProviderKind): Row => ({
    key: kind,
    kind,
    title: PROVIDER_LABELS[kind],
    description: PROVIDER_DESCRIPTIONS[kind],
    label: MANY.has(kind) ? "Add" : "Set up",
  });
  const rows: Row[] = [
    ...availableRows.flatMap((kind) => (kind !== "openai-compatible" ? [kindRow(kind)] : [])),
    ...presets.map((preset): Row => ({
      key: preset.id,
      kind: "openai-compatible",
      preset,
      title: preset.name,
      description: preset.description,
      label: "Set up",
    })),
    ...availableRows.flatMap((kind) => (kind === "openai-compatible" ? [kindRow(kind)] : [])),
  ];

  const needle = query.trim().toLowerCase();
  const matching = needle
    ? rows.filter((row) => `${row.title} ${row.description}`.toLowerCase().includes(needle))
    : rows;
  const collapsible = !needle && rows.length > COLLAPSED_ROWS;
  const visible = collapsible && !expanded ? matching.slice(0, COLLAPSED_ROWS) : matching;

  return (
    <div className="flex flex-col">
      {featured.length > 0 && (
        <section className="flex flex-col gap-4 border-t py-6 md:py-8">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold tracking-tight">Subscription plans</h2>
            <p className="max-w-2xl text-xs text-pretty text-muted-foreground">
              Run threads on Claude's or Codex's own agent, with the plan or key you already have.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {featured.map((kind) => {
              const provider = providers.find((item) => item.kind === kind);

              return (
                <Highlight
                  key={kind}
                  kind={kind}
                  provider={provider}
                  modelLabel={
                    provider?.modelId
                      ? byProvider[provider.id]?.labels?.[provider.modelId]
                      : undefined
                  }
                />
              );
            })}
          </ul>
        </section>
      )}
      {connected.length > 0 && (
        <Group title="Connected">
          {connected.map((provider) => (
            <li
              key={provider.id}
              aria-label={provider.name}
              className="flex items-center gap-3.5 py-3.5"
            >
              <Tile kind={provider.kind} baseUrl={provider.baseUrl} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{provider.name}</span>
                  {isSubscription(provider) && <Badge variant="outline">Subscription</Badge>}
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
        {rows.length > COLLAPSED_ROWS && (
          <li className="py-3.5">
            <Input
              type="search"
              aria-label="Search providers"
              placeholder="Search providers"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </li>
        )}
        {visible.map((row) => (
          <li key={row.key} aria-label={row.title} className="flex items-center gap-3.5 py-3.5">
            <Tile kind={row.kind} preset={row.preset?.id} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2.5">
              <span className="text-sm font-medium">{row.title}</span>
              <span className="truncate text-xs text-muted-foreground">{row.description}</span>
            </div>
            <ProviderDialog kind={row.kind} preset={row.preset} label={row.label} />
          </li>
        ))}
        {needle && matching.length === 0 && (
          <li className="py-6 text-sm text-muted-foreground">
            No provider matches “{query.trim()}”.
          </li>
        )}
        {collapsible && (
          <li className="py-3.5">
            <Button variant="ghost" size="sm" onClick={() => setExpanded((value) => !value)}>
              {expanded ? "Show fewer" : `Show all ${rows.length} providers`}
            </Button>
          </li>
        )}
      </Group>
    </div>
  );
}
