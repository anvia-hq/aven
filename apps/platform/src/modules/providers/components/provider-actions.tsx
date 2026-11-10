import { Trash } from "@mynaui/icons-react";
import type { ReactNode } from "react";

import { Button } from "@/components/button";

import { useProviders } from "../hooks/use-providers";
import { useRefetchModels } from "../hooks/use-refetch-models";
import type { Provider } from "../types";

type Props = {
  provider: Provider;
  edit?: ReactNode;
};

export function ProviderActions({ provider, edit }: Props) {
  const { makeDefault, remove } = useProviders();
  const { refetch, fetching } = useRefetchModels();
  return (
    <>
      {provider.kind !== "codex" && (
        <Button
          variant="ghost"
          size="xs"
          disabled={fetching === provider.id}
          onClick={() => void refetch(provider)}
        >
          {fetching === provider.id ? "Fetching…" : "Refetch models"}
        </Button>
      )}
      {!provider.isDefault && (
        <Button variant="ghost" size="xs" onClick={() => makeDefault(provider)}>
          Make default
        </Button>
      )}
      {edit}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove ${provider.name}`}
        onClick={() => remove(provider)}
      >
        <Trash />
      </Button>
    </>
  );
}
