import { CLAUDE_DEFAULT_EFFORT, CLAUDE_EFFORTS } from "@aven/protocol/claude-models";
import { ArrowLeft, ChevronRight } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/popover";
import { ModelChoiceList } from "@/modules/providers/components/model-choice-list";
import { ProviderLogo } from "@/modules/providers/components/provider-logo";

import { AGENT_GROUPS, agentGroup, agentLabel } from "../agent-models";
import type { useModelSelection } from "../hooks/use-model-selection";
import type { AgentControl } from "../types";
import { EffortSlider, effortName } from "./effort-slider";

type Props = { model: ReturnType<typeof useModelSelection>; agent?: AgentControl };

export function ModelMenu({ model, agent }: Props) {
  const { providers, provider, modelId, modelLabel, choices, loadingModels, levels, effort } =
    model;
  const [choosing, setChoosing] = useState(false);
  const using = agent?.choice ?? null;
  const only = agent?.only ?? false;

  const addProvider = (
    <Link to="/settings/providers" className="text-xs text-muted-foreground underline">
      Add a provider to choose a model
    </Link>
  );

  if (!provider && !agent) return addProvider;

  const listing = choosing || (!provider && !using);

  const usingClaude = using?.backend === "claude";
  const shownLevels = usingClaude ? [...CLAUDE_EFFORTS] : using ? [] : levels;
  const shownEffort = usingClaude ? (using.effort ?? CLAUDE_DEFAULT_EFFORT) : effort;
  const efforts = shownLevels.length > 1;
  const label = using ? agentLabel(using) : (modelLabel ?? "Provider default");
  const kind = using ? agentGroup(using.backend)?.logo : provider?.kind;
  const selectEffort = (next: string) =>
    using ? agent?.onChange({ ...using, effort: next }) : model.selectEffort(next);

  return (
    <>
      {!provider && !only && addProvider}
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
          {kind && <ProviderLogo kind={kind} />}
          <span className="truncate font-medium text-foreground">{label}</span>
          {efforts && <span className="shrink-0">{effortName(shownEffort)}</span>}
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          className="w-80 max-w-[calc(100vw-2rem)] gap-0 rounded-2xl p-0"
        >
          {listing ? (
            <div className="flex flex-col gap-1 p-3 pb-0">
              <div className="flex items-center gap-2 pb-1">
                {(provider || using) && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Back"
                    onClick={() => setChoosing(false)}
                  >
                    <ArrowLeft />
                  </Button>
                )}
                <span className="font-medium">Choose model</span>
              </div>
              <ModelChoiceList
                providers={only ? [] : providers}
                choices={only ? [] : choices}
                loading={loadingModels}
                selected={provider && !using ? { providerId: provider.id, modelId } : undefined}
                onSelect={(choice) => {
                  model.selectModel(choice);
                  agent?.onChange(null);
                  setChoosing(false);
                }}
                extras={
                  agent &&
                  AGENT_GROUPS.map((group) => ({
                    heading: group.heading,
                    items: group.models,
                    selected:
                      using?.backend === group.backend ? (using.modelId ?? "default") : null,
                    onSelect: (id: string) => {
                      agent.onChange({
                        backend: group.backend,
                        modelId: id === "default" ? undefined : id,
                        effort: using?.backend === group.backend ? using.effort : undefined,
                      });
                      setChoosing(false);
                    },
                  }))
                }
              />
            </div>
          ) : (
            <div className="flex flex-col gap-3 p-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs tracking-wide text-muted-foreground uppercase">
                  {efforts ? "Reasoning" : "Model"}
                </span>
                {efforts && (
                  <span className="text-xl font-semibold">{effortName(shownEffort)}</span>
                )}
              </div>
              <Button
                variant="outline"
                className="w-fit max-w-full rounded-full"
                onClick={() => setChoosing(true)}
              >
                {kind && <ProviderLogo kind={kind} />}
                <span className="truncate">{label}</span>
                <ChevronRight />
              </Button>
              {efforts && (
                <EffortSlider levels={shownLevels} value={shownEffort} onChange={selectEffort} />
              )}
            </div>
          )}
          {!only && (
            <div className="border-t px-4 py-3 text-sm">
              <Link
                to="/settings/providers"
                className="text-muted-foreground hover:text-foreground"
              >
                Manage models
              </Link>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </>
  );
}
