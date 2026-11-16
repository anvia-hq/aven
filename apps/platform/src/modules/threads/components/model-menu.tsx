import { ChevronRight } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@aven/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@aven/ui/popover";
import { ModelChoiceList } from "@/modules/providers/components/model-choice-list";
import { ProviderLogo } from "@/modules/providers/components/provider-logo";
import { isSubscription } from "@/modules/providers/types";

import type { useModelSelection } from "../hooks/use-model-selection";
import { EffortSlider, effortName } from "./effort-slider";

type Props = { model: ReturnType<typeof useModelSelection> };

export function ModelMenu({ model }: Props) {
  const { providers, provider, modelId, modelLabel, choices, loadingModels, levels, effort } =
    model;
  const [choosing, setChoosing] = useState(false);

  const addProvider = (
    <Link to="/settings/providers" className="text-xs text-muted-foreground underline">
      Add a provider to choose a model
    </Link>
  );

  if (!provider) return addProvider;

  const listing = choosing;
  const efforts = levels.length > 1;
  const subscription = isSubscription(provider);

  return (
    <Popover onOpenChange={(open) => !open && setChoosing(false)}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label="Model and reasoning effort"
            title={subscription ? `Runs on your ${provider.name}` : provider.name}
            className="max-w-full min-w-0 bg-muted/50 px-2 text-muted-foreground"
          />
        }
      >
        <ProviderLogo kind={provider.kind} baseUrl={provider.baseUrl} />
        <span className="truncate font-medium text-foreground">{modelLabel ?? provider.name}</span>
        {efforts && <span className="shrink-0">{effortName(effort)}</span>}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-80 max-w-[calc(100vw-2rem)] gap-0 rounded-2xl p-0"
      >
        {listing ? (
          <div className="flex flex-col gap-1 p-3 pb-0">
            <div className="flex items-center gap-2 pb-1">
              <span className="font-medium">Choose model</span>
            </div>
            <ModelChoiceList
              providers={providers}
              choices={choices}
              loading={loadingModels}
              selected={{ providerId: provider.id, modelId }}
              onSelect={(choice) => {
                model.selectModel(choice);
                setChoosing(false);
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs tracking-wide text-muted-foreground uppercase">
                {efforts ? "Reasoning" : "Model"}
              </span>
              {efforts && <span className="text-xl font-semibold">{effortName(effort)}</span>}
            </div>
            <Button
              variant="outline"
              className="w-fit max-w-full rounded-full"
              onClick={() => setChoosing(true)}
            >
              <ProviderLogo kind={provider.kind} baseUrl={provider.baseUrl} />
              <span className="truncate">{modelLabel ?? "Provider default"}</span>
              <ChevronRight />
            </Button>
            {efforts && (
              <EffortSlider levels={levels} value={effort} onChange={model.selectEffort} />
            )}
          </div>
        )}
        <div className="border-t px-4 py-3 text-sm">
          <Link to="/settings/providers" className="text-muted-foreground hover:text-foreground">
            {subscription ? "Manage your subscription" : "Manage models"}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
