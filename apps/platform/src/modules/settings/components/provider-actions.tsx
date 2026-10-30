import { Trash } from "@mynaui/icons-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/badge";
import { Button } from "@/components/button";

import { useProviders } from "../hooks/use-providers";
import type { Provider } from "../types";

type Props = {
  provider: Provider;
  /** What the line says about the provider, between its badge and its buttons. */
  children: ReactNode;
  /** A way to edit it, before the remove button. */
  edit?: ReactNode;
};

// A saved provider on its line of the list: whether it is the default, then making it the
// default, editing and removing it.
export function ProviderActions({ provider, children, edit }: Props) {
  const { makeDefault, remove } = useProviders();
  return (
    <>
      {provider.isDefault && <Badge variant="secondary">Default</Badge>}
      {children}
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
