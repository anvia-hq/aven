import { Check, ChevronDown } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/popover";
import { ModelChoiceList } from "@/modules/providers/components/model-choice-list";
import { ProviderLogo } from "@/modules/providers/components/provider-logo";
import type { ModelChoice } from "@/modules/providers/types";

import { useBotModel } from "../hooks/use-bot-model";
import { useBots } from "../hooks/use-bots";
import type { Bot } from "../types";

export function BotModelSelect({ bot }: { bot: Bot }) {
  const { providers, loaded, choices, loading, provider, modelId, labelOf } = useBotModel(bot);
  const { update } = useBots();
  const [open, setOpen] = useState(false);

  if (loaded && providers.length === 0) {
    return (
      <Link to="/settings/providers" className="text-xs text-muted-foreground underline">
        Add a provider to choose a model
      </Link>
    );
  }

  let shown = "Default model";

  if (provider) shown = modelId ? labelOf(provider.id, modelId) : "Provider default";

  async function choose(change: { providerId: string | null; modelId?: string }) {
    setOpen(false);
    await update(bot, change);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label={`Model of ${bot.name}`}
            className="max-w-64 min-w-0"
          />
        }
      >
        {provider && <ProviderLogo kind={provider.kind} baseUrl={provider.baseUrl} />}
        <span className="truncate">{shown}</span>
        <ChevronDown />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] gap-0 rounded-2xl p-0">
        <div className="border-b p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between"
            onClick={() => void choose({ providerId: null })}
          >
            Use my default model
            {!provider && <Check />}
          </Button>
        </div>
        <div className="p-3">
          <ModelChoiceList
            providers={providers}
            choices={choices}
            loading={loading}
            selected={provider && { providerId: provider.id, modelId }}
            onSelect={(choice: ModelChoice) =>
              void choose({ providerId: choice.provider.id, modelId: choice.modelId })
            }
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
