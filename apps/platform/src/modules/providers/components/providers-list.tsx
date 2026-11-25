import { PROVIDERS } from "@aven/protocol/runtime-wire";
import { useState } from "react";
import type { ReactNode } from "react";

import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";
import { Input } from "@aven/ui/input";
import { Skeleton } from "@aven/ui/skeleton";

import { usePlatformConfig } from "@/modules/platform/hooks/use-platform-config";
import { COMPATIBLE_PRESETS, presetOf } from "../presets";
import { useProviders } from "../hooks/use-providers";
import { useProvidersModels } from "../hooks/use-provider-models";
import { isSubscription, PROVIDER_DESCRIPTIONS, PROVIDER_LABELS } from "../types";
import type { CompatiblePreset, Provider, ProviderKind } from "../types";
import { ProviderActions } from "./provider-actions";
import { ProviderDialog } from "./provider-dialog";
import { ProviderLogo } from "./provider-logo";
import { ProviderPanel } from "./provider-panel";

const MANY = new Set<ProviderKind>(["openai-compatible", "bedrock", "vertex"]);
const FEATURED: ProviderKind[] = ["claude-subscription", "codex-subscription"];
const SEARCH_FROM = 5;

const connectedPresets = (providers: Provider[]) =>
  new Set(providers.map((provider) => presetOf(provider)?.id));

type Row = {
  key: string;
  kind: ProviderKind;
  preset?: CompatiblePreset;
  title: string;
  description: string;
};

const detail = (provider: Provider, label: string | undefined) => label ?? provider.modelId ?? "";

const CONFIGURED_BADGE = "border-transparent bg-success text-primary-foreground";

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
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:p-6"
    >
      <div className="flex items-center gap-3.5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted/60">
          <ProviderLogo kind={kind} size="lg" />
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-lg font-semibold tracking-tight">{PROVIDER_LABELS[kind]}</span>
          {provider && <Badge className={CONFIGURED_BADGE}>Connected</Badge>}
          {provider?.isDefault && <Badge variant="secondary">Default</Badge>}
        </span>
      </div>
      <p className="max-w-prose text-sm leading-relaxed text-pretty text-muted-foreground">
        {PROVIDER_DESCRIPTIONS[kind]}
      </p>
      {provider ? (
        <div className="mt-auto flex flex-col gap-2 border-t pt-3">
          {detail(provider, modelLabel) && (
            <p className="truncate font-mono text-xs text-muted-foreground">
              {detail(provider, modelLabel)}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1">
            <ProviderActions
              provider={provider}
              edit={<ProviderDialog kind={kind} provider={provider} label="Edit" />}
            />
          </div>
        </div>
      ) : (
        <div className="mt-auto flex items-center pt-1">
          <ProviderDialog kind={kind} label="Set up" prominent />
        </div>
      )}
    </li>
  );
}

function Group({
  title,
  description,
  toolbar,
  children,
}: {
  title: string;
  description?: string;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-xs text-pretty text-muted-foreground">{description}</p>}
      </div>
      {toolbar}
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/50">
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
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/60">
      <ProviderLogo kind={kind} baseUrl={baseUrl} preset={preset} />
    </span>
  );
}

const OFFERED_BACKEND: Partial<Record<ProviderKind, "claudeBackend" | "codexBackend">> = {
  "claude-subscription": "claudeBackend",
  "codex-subscription": "codexBackend",
};

export function ProvidersList() {
  const { providers, loaded, makeDefault } = useProviders();
  const { byProvider } = useProvidersModels(providers.map((item) => item.id));
  const { config } = usePlatformConfig();
  const [query, setQuery] = useState("");
  const [openPanel, setOpenPanel] = useState<string | null>(null);

  if (!loaded) {
    return (
      <div className="flex flex-col gap-8 pt-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      </div>
    );
  }

  const offered = (kind: ProviderKind) => {
    const flag = OFFERED_BACKEND[kind];

    return !flag || config?.[flag] !== false;
  };
  const own = providers.filter((provider) => !provider.managed);
  const available = PROVIDERS.filter(
    (kind) => offered(kind) && (MANY.has(kind) || !own.some((provider) => provider.kind === kind)),
  );

  const taken = connectedPresets(own);
  const presets = COMPATIBLE_PRESETS.filter((preset) => !taken.has(preset.id));
  const featured = FEATURED.filter(offered);
  const availableRows = available.filter((kind) => !featured.includes(kind));
  const connected = providers.filter(
    (provider) => provider.managed || !featured.includes(provider.kind),
  );
  const kindRow = (kind: ProviderKind): Row => ({
    key: kind,
    kind,
    title: PROVIDER_LABELS[kind],
    description: PROVIDER_DESCRIPTIONS[kind],
  });
  const rows: Row[] = [
    ...availableRows.flatMap((kind) => (kind !== "openai-compatible" ? [kindRow(kind)] : [])),
    ...presets.map((preset): Row => ({
      key: preset.id,
      kind: "openai-compatible",
      preset,
      title: preset.name,
      description: preset.description,
    })),
    ...availableRows.flatMap((kind) => (kind === "openai-compatible" ? [kindRow(kind)] : [])),
  ];

  const needle = query.trim().toLowerCase();
  const matchingConnected = needle
    ? connected.filter((provider) =>
        `${provider.name} ${PROVIDER_LABELS[provider.kind]} ${provider.baseUrl ?? ""} ${provider.modelId ?? ""}`
          .toLowerCase()
          .includes(needle),
      )
    : connected;
  const matchingRows = needle
    ? rows.filter((row) => `${row.title} ${row.description}`.toLowerCase().includes(needle))
    : rows;
  const totalRows = connected.length + rows.length;
  const matchingCount = matchingConnected.length + matchingRows.length;

  return (
    <div className="flex flex-col gap-8 pt-2">
      {featured.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold tracking-tight">Subscription plans</h2>
            <p className="max-w-2xl text-xs text-pretty text-muted-foreground">
              Run threads on Claude's or Codex's own agent, with the plan or key you already have.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {featured.map((kind) => {
              const provider = own.find((item) => item.kind === kind);

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
      <Group
        title="Model providers"
        description="Keys are encrypted and never shown again. They follow you across workspaces."
        toolbar={
          totalRows > SEARCH_FROM ? (
            <Input
              type="search"
              aria-label="Search providers"
              placeholder="Search providers"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          ) : undefined
        }
      >
        {matchingConnected.map((provider) => {
          const subtitle = detail(
            provider,
            provider.modelId ? byProvider[provider.id]?.labels?.[provider.modelId] : undefined,
          );
          const summary = (
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">{provider.name}</span>
                {provider.managed && <Badge variant="secondary">Managed</Badge>}
                {isSubscription(provider) && <Badge variant="outline">Subscription</Badge>}
                {provider.isDefault && <Badge variant="secondary">Default</Badge>}
              </div>
              {subtitle && (
                <p className="truncate font-mono text-xs text-muted-foreground">{subtitle}</p>
              )}
            </div>
          );

          if (provider.managed) {
            return (
              <li
                key={provider.id}
                aria-label={provider.name}
                className="flex items-center gap-3.5 px-4 py-3"
              >
                <Tile kind={provider.kind} baseUrl={provider.baseUrl} />
                {summary}
                <Badge className={CONFIGURED_BADGE}>Configured</Badge>
              </li>
            );
          }

          const panelId = `connected:${provider.id}`;

          return (
            <ProviderPanel
              key={provider.id}
              ariaLabel={provider.name}
              kind={provider.kind}
              provider={provider}
              preset={presetOf(provider)}
              triggerLabel="Edit"
              open={openPanel === panelId}
              onOpenChange={(next) => setOpenPanel(next ? panelId : null)}
              leading={<Tile kind={provider.kind} baseUrl={provider.baseUrl} />}
              summary={summary}
              actions={(trigger) => (
                <>
                  {!provider.isDefault && (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="relative z-10"
                      onClick={() => void makeDefault(provider)}
                    >
                      Make default
                    </Button>
                  )}
                  <Badge className={CONFIGURED_BADGE}>Configured</Badge>
                  {trigger}
                </>
              )}
            />
          );
        })}
        {matchingRows.map((row) => {
          const panelId = `add:${row.key}`;

          return (
            <ProviderPanel
              key={row.key}
              ariaLabel={row.title}
              kind={row.kind}
              preset={row.preset}
              triggerLabel="Set up"
              open={openPanel === panelId}
              onOpenChange={(next) => setOpenPanel(next ? panelId : null)}
              leading={<Tile kind={row.kind} preset={row.preset?.id} />}
              summary={
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2.5">
                  <span className="text-sm font-medium">{row.title}</span>
                  <span className="truncate text-xs text-muted-foreground">{row.description}</span>
                </div>
              }
            />
          );
        })}
        {needle && matchingCount === 0 && (
          <li className="px-4 py-6 text-sm text-muted-foreground">
            No provider matches “{query.trim()}”.
          </li>
        )}
      </Group>
    </div>
  );
}
