import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@aven/ui/command";

import type { ReactNode } from "react";

import type { ModelChoice, Provider } from "../types";
import { ProviderLogo } from "./provider-logo";
import { SubsSpark } from "./subs-mark";

export type ModelExtraGroup = {
  heading: ReactNode;
  items: readonly { id: string; label: string }[];
  selected: string | null;
  onSelect: (id: string) => void;
  badge: string;
  mark: "subscription" | "openai";
};

type Props = {
  providers: Provider[];
  choices: ModelChoice[];
  loading: boolean;
  selected?: { providerId: string; modelId: string | null };
  onSelect: (choice: ModelChoice) => void;
  extras?: readonly ModelExtraGroup[];
};

export function ModelChoiceList({
  providers,
  choices,
  loading,
  selected,
  onSelect,
  extras = [],
}: Props) {
  return (
    <Command>
      <CommandInput placeholder={loading ? "Loading models…" : "Search models…"} />
      <CommandList className="max-h-60">
        <CommandEmpty>No models found</CommandEmpty>
        {providers.map((item) => (
          <CommandGroup
            key={item.id}
            heading={
              <span className="flex items-center gap-1.5">
                <ProviderLogo kind={item.kind} baseUrl={item.baseUrl} />
                {item.name}
              </span>
            }
          >
            {choices.flatMap((choice) =>
              choice.provider.id === item.id
                ? [
                    <CommandItem
                      key={choice.modelId}
                      value={`${choice.label} ${choice.modelId} ${item.name} ${item.id}`}
                      data-checked={
                        item.id === selected?.providerId && choice.modelId === selected.modelId
                      }
                      onSelect={() => onSelect(choice)}
                    >
                      <span className="truncate">{choice.label}</span>
                    </CommandItem>,
                  ]
                : [],
            )}
          </CommandGroup>
        ))}
        {extras.map((extra) => (
          <CommandGroup key={extra.badge} heading={extra.heading}>
            {extra.items.map((item) => (
              <CommandItem
                key={`${extra.badge}-${item.id}`}
                value={`${item.label} ${item.id} ${extra.heading}`}
                data-checked={item.id === extra.selected}
                onSelect={() => extra.onSelect(item.id)}
              >
                {extra.mark === "openai" ? <ProviderLogo kind="openai" /> : <SubsSpark />}
                <span className="truncate">{item.label}</span>
                <span className="ml-auto text-xs text-muted-foreground">{extra.badge}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}
