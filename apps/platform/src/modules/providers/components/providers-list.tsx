import type { ReactNode } from "react";

import { useProviders } from "../hooks/use-providers";
import {
  PROVIDER_DESCRIPTIONS,
  PROVIDER_KINDS,
  PROVIDER_LABELS,
  type Provider,
  type ProviderKind,
} from "../types";
import { ProviderActions } from "./provider-actions";
import { ProviderDialog } from "./provider-dialog";
import { ProviderLogo } from "./provider-logo";

const detail = (provider: Provider) =>
  [provider.baseUrl, provider.modelId, provider.keyHint && `…${provider.keyHint}`]
    .filter(Boolean)
    .join(" · ");

// A line of the list: the logo and name of a kind, then whatever follows on that line.
function Row({ kind, children }: { kind: ProviderKind; children: ReactNode }) {
  return (
    <section aria-label={PROVIDER_LABELS[kind]} className="border-b py-3">
      {children}
    </section>
  );
}

function Heading({ kind }: { kind: ProviderKind }) {
  return (
    <>
      <ProviderLogo kind={kind} />
      <h2 className="text-sm font-medium">{PROVIDER_LABELS[kind]}</h2>
    </>
  );
}

// OpenAI, Anthropic and Azure have one credential each, shown on the kind's own line; an
// OpenAI-compatible server is one of many, so those are listed under theirs.
export function ProvidersList() {
  const { providers, loaded } = useProviders();

  if (!loaded) return null;

  return (
    <div className="flex flex-col border-t">
      {PROVIDER_KINDS.map((kind) => {
        const ofKind = providers.filter((provider) => provider.kind === kind);
        return kind === "openai-compatible" ? (
          <CompatibleRow key={kind} kind={kind} providers={ofKind} />
        ) : (
          <SingleRow key={kind} kind={kind} provider={ofKind[0]} />
        );
      })}
    </div>
  );
}

// A kind with one credential: the provider when it is set up, else what setting it up gives.
function SingleRow({ kind, provider }: { kind: ProviderKind; provider: Provider | undefined }) {
  return (
    <Row kind={kind}>
      <div className="flex items-center gap-2.5">
        <Heading kind={kind} />
        {provider ? (
          <ProviderActions
            provider={provider}
            edit={<ProviderDialog kind={kind} provider={provider} label="Edit" />}
          >
            <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
              {detail(provider)}
            </p>
          </ProviderActions>
        ) : (
          <>
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {PROVIDER_DESCRIPTIONS[kind]}
            </p>
            <ProviderDialog kind={kind} label="Set up" />
          </>
        )}
      </div>
    </Row>
  );
}

// OpenAI-compatible servers: any number, each on its own line under the kind's.
function CompatibleRow({ kind, providers }: { kind: ProviderKind; providers: Provider[] }) {
  return (
    <Row kind={kind}>
      <div className="flex items-center gap-2.5">
        <Heading kind={kind} />
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {PROVIDER_DESCRIPTIONS[kind]}
        </p>
        <ProviderDialog kind={kind} label="Add" />
      </div>
      {providers.length > 0 && (
        <ul className="mt-1.5 flex flex-col pl-6.5">
          {providers.map((provider) => (
            <li key={provider.id} className="flex items-center gap-2 py-1 text-xs">
              <span className="font-medium">{provider.name}</span>
              <ProviderActions provider={provider}>
                <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
                  {detail(provider)}
                </span>
              </ProviderActions>
            </li>
          ))}
        </ul>
      )}
    </Row>
  );
}
