import { ChevronDown } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";

import type { useModelSelection } from "../hooks/use-model-selection";
import { EffortSlider } from "./effort-slider";

type Props = { model: ReturnType<typeof useModelSelection> };

// Provider, model and reasoning effort in one trigger and one panel. With no provider yet, a link
// to add one: the server's shared model still answers, but nothing here can be chosen.
export function ModelMenu({ model }: Props) {
  const { providers, provider, modelId, modelOptions, loadingModels, levels, effort } = model;

  if (!provider) {
    return (
      <Link to="/settings/providers" className="text-xs text-muted-foreground underline">
        Add a provider to choose a model
      </Link>
    );
  }

  const providerItems = providers.map((item) => ({ value: item.id, label: item.name }));

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label="Model and reasoning effort"
            className="max-w-full min-w-0 rounded-full bg-muted/40 pr-2 pl-3 text-muted-foreground"
          />
        }
      >
        <span className="truncate text-foreground">{modelId ?? "Provider default"}</span>
        {levels.length > 1 && <span className="shrink-0">· {effort}</span>}
        <ChevronDown />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-80 max-w-[calc(100vw-2rem)] rounded-xl p-1.5"
      >
        {providers.length > 1 && (
          <Select
            items={providerItems}
            value={provider.id}
            onValueChange={(value) => value && model.selectProvider(value)}
          >
            <SelectTrigger size="sm" aria-label="Provider" className="w-full">
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
        <Command>
          <CommandInput placeholder={loadingModels ? "Loading models…" : "Search models…"} />
          <CommandList className="max-h-56">
            <CommandEmpty>No models found</CommandEmpty>
            <CommandGroup>
              {modelOptions.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  data-checked={option === modelId}
                  onSelect={() => model.selectModel(option)}
                >
                  <span className="truncate">{option}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {levels.length > 1 && (
          <div className="border-t px-2 pt-3 pb-2">
            <EffortSlider levels={levels} value={effort} onChange={model.selectEffort} />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
