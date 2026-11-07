import { ArrowLeft, ChevronRight } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/popover";
import { ModelChoiceList } from "@/modules/providers/components/model-choice-list";
import { ProviderLogo } from "@/modules/providers/components/provider-logo";

import type { useModelSelection } from "../hooks/use-model-selection";
import { EffortSlider, effortName } from "./effort-slider";

type Props = { model: ReturnType<typeof useModelSelection> };

export function ModelMenu({ model }: Props) {
  const { providers, provider, modelId, choices, loadingModels, levels, effort } = model;
  const [choosing, setChoosing] = useState(false);

  if (!provider) {
    return (
      <Link to="/settings/providers" className="text-xs text-muted-foreground underline">
        Add a provider to choose a model
      </Link>
    );
  }

  const efforts = levels.length > 1;

  return (
    <Popover onOpenChange={(open) => !open && setChoosing(false)}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label="Model and reasoning effort"
            className="max-w-full min-w-0 bg-muted/50 px-2 text-muted-foreground"
          />
        }
      >
        <ProviderLogo kind={provider.kind} />
        <span className="truncate font-medium text-foreground">
          {modelId ?? "Provider default"}
        </span>
        {efforts && <span className="shrink-0">{effortName(effort)}</span>}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-80 max-w-[calc(100vw-2rem)] gap-0 rounded-2xl p-0"
      >
        {choosing ? (
          <div className="flex flex-col gap-1 p-3 pb-0">
            <div className="flex items-center gap-2 pb-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Back"
                onClick={() => setChoosing(false)}
              >
                <ArrowLeft />
              </Button>
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
              <ProviderLogo kind={provider.kind} />
              <span className="truncate">{modelId ?? "Provider default"}</span>
              <ChevronRight />
            </Button>
            {efforts && (
              <EffortSlider levels={levels} value={effort} onChange={model.selectEffort} />
            )}
          </div>
        )}
        <div className="border-t px-4 py-3 text-sm">
          <Link to="/settings/providers" className="text-muted-foreground hover:text-foreground">
            Manage models
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
