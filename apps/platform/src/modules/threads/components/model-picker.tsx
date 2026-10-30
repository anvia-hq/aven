import { Link } from "@tanstack/react-router";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";
import type { Provider } from "@/modules/settings/types";

type Props = {
  providers: Provider[];
  provider: Provider | undefined;
  modelId: string | null;
  modelOptions: string[];
  loadingModels: boolean;
  onProvider: (providerId: string) => void;
  onModel: (modelId: string) => void;
};

// Provider (only when there is a choice) and model. With no provider yet, a link to add one: the
// server's shared model still answers, but nothing here can be chosen.
export function ModelPicker({
  providers,
  provider,
  modelId,
  modelOptions,
  loadingModels,
  onProvider,
  onModel,
}: Props) {
  if (!provider) {
    return (
      <Link to="/settings/providers" className="text-xs text-muted-foreground underline">
        Add a provider to choose a model
      </Link>
    );
  }

  const providerItems = providers.map((item) => ({ value: item.id, label: item.name }));

  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
      {providers.length > 1 && (
        <Select
          items={providerItems}
          value={provider.id}
          onValueChange={(value) => value && onProvider(value)}
        >
          <SelectTrigger size="sm" aria-label="Provider" className="w-28 max-w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providerItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Combobox
        items={modelOptions}
        value={modelId}
        onValueChange={(value) => value && onModel(value)}
      >
        <ComboboxInput
          aria-label="Model"
          placeholder={loadingModels ? "Loading models…" : "Provider default"}
          className="w-44 max-w-full"
        />
        <ComboboxContent side="top">
          <ComboboxEmpty>No models found</ComboboxEmpty>
          <ComboboxList>
            {(item: string) => (
              <ComboboxItem key={item} value={item}>
                {item}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
