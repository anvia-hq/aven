import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/command";

import type { ModelChoice, Provider } from "../types";
import { ProviderLogo } from "./provider-logo";

type Props = {
  providers: Provider[];
  choices: ModelChoice[];
  loading: boolean;
  /** The model in use, marked in the list. */
  selected?: { providerId: string; modelId: string | null };
  onSelect: (choice: ModelChoice) => void;
};

// Every provider's models in one searchable list, under a heading per provider.
export function ModelChoiceList({ providers, choices, loading, selected, onSelect }: Props) {
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
            {choices
              .filter((choice) => choice.provider.id === item.id)
              .map((choice) => (
                <CommandItem
                  key={choice.modelId}
                  value={`${choice.modelId} ${item.name} ${item.id}`}
                  data-checked={
                    item.id === selected?.providerId && choice.modelId === selected.modelId
                  }
                  onSelect={() => onSelect(choice)}
                >
                  <span className="truncate">{choice.modelId}</span>
                </CommandItem>
              ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}
