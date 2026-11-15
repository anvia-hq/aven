import { CLAUDE_DEFAULT_EFFORT, CLAUDE_EFFORTS } from "@aven/protocol/claude-models";
import { CODEX_DEFAULT_EFFORT, CODEX_EFFORTS } from "@aven/protocol/codex-models";
import { ArrowLeft, ChevronRight } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@aven/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@aven/ui/popover";
import {
  ModelChoiceList,
  type ModelExtraGroup,
} from "@/modules/providers/components/model-choice-list";
import { ProviderLogo } from "@/modules/providers/components/provider-logo";
import { SubsSpark } from "@/modules/providers/components/subs-mark";

import { CLAUDE_GROUP, CLAUDE_ITEMS, claudeTriggerLabel } from "../claude-models";
import { CODEX_GROUP, CODEX_ITEMS, codexTriggerLabel } from "../codex-models";
import type { useModelSelection } from "../hooks/use-model-selection";
import type { ClaudeControl, CodexControl } from "../types";
import { EffortSlider, effortName } from "./effort-slider";

type Props = {
  model: ReturnType<typeof useModelSelection>;
  claude?: ClaudeControl;
  codex?: CodexControl;
};

export function ModelMenu({ model, claude, codex }: Props) {
  const { providers, provider, modelId, modelLabel, choices, loadingModels, levels, effort } =
    model;
  const [choosing, setChoosing] = useState(false);
  const only = (claude?.only ?? false) || (codex?.only ?? false);
  const usingClaude = claude?.choice != null;
  const usingCodex = codex?.choice != null;
  const hosted = usingClaude || usingCodex;

  const addProvider = (
    <Link to="/settings/providers" className="text-xs text-muted-foreground underline">
      Add a provider to choose a model
    </Link>
  );

  if (!provider && !claude && !codex) return addProvider;

  const listing = choosing || (!provider && !hosted);
  let shownLevels = levels;
  let shownEffort = effort;
  let label = modelLabel;
  let kind = provider?.kind;
  let title: string | undefined;

  if (usingClaude && claude) {
    shownLevels = [...CLAUDE_EFFORTS];
    shownEffort = claude.choice?.effort ?? CLAUDE_DEFAULT_EFFORT;
    label = claudeTriggerLabel(claude.choice?.modelId);
    kind = "anthropic";
    title = "Runs on your Claude subscription (Agent SDK)";
  } else if (usingCodex && codex) {
    shownLevels = [...CODEX_EFFORTS];
    shownEffort = codex.choice?.effort ?? CODEX_DEFAULT_EFFORT;
    label = codexTriggerLabel(codex.choice?.modelId);
    kind = "openai";
    title = "Runs on your OpenAI API key (Codex SDK)";
  }

  const efforts = shownLevels.length > 1;
  const selectEffort = (next: string) => {
    if (usingClaude && claude) claude.onChange({ ...claude.choice, effort: next });
    else if (usingCodex && codex) codex.onChange({ ...codex.choice, effort: next });
    else model.selectEffort(next);
  };
  const extras: ModelExtraGroup[] = [];

  if (claude) {
    extras.push({
      heading: CLAUDE_GROUP,
      items: CLAUDE_ITEMS,
      selected: usingClaude ? (claude.choice?.modelId ?? "default") : null,
      onSelect: (id) => {
        codex?.onChange(null);
        claude.onChange({
          modelId: id === "default" ? undefined : id,
          effort: claude.choice?.effort,
        });
        setChoosing(false);
      },
      badge: "Subs",
      mark: "subscription",
    });
  }

  if (codex) {
    extras.push({
      heading: CODEX_GROUP,
      items: CODEX_ITEMS,
      selected: usingCodex ? (codex.choice?.modelId ?? "default") : null,
      onSelect: (id) => {
        claude?.onChange(null);
        codex.onChange({
          modelId: id === "default" ? undefined : id,
          effort: codex.choice?.effort,
        });
        setChoosing(false);
      },
      badge: "API",
      mark: "openai",
    });
  }

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
              title={title}
              className="max-w-full min-w-0 bg-muted/50 px-2 text-muted-foreground"
            />
          }
        >
          {usingClaude ? <SubsSpark /> : kind && <ProviderLogo kind={kind} />}
          <span className="truncate font-medium text-foreground">
            {label ?? "Provider default"}
          </span>
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
                {(provider || hosted) && (
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
                selected={provider && !hosted ? { providerId: provider.id, modelId } : undefined}
                onSelect={(choice) => {
                  model.selectModel(choice);
                  claude?.onChange(null);
                  codex?.onChange(null);
                  setChoosing(false);
                }}
                extras={extras}
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
                {usingClaude ? <SubsSpark /> : kind && <ProviderLogo kind={kind} />}
                <span className="truncate">{label ?? "Provider default"}</span>
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
