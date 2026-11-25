import { IconBolt, IconCheck, IconCpu, IconSettings } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@aven/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@aven/ui/dropdown-menu";
import { ProviderLogo } from "@/modules/providers/components/provider-logo";
import { isSubscription } from "@/modules/providers/types";

import type { useModelSelection } from "../hooks/use-model-selection";
import { effortName } from "./effort-slider";

type Props = { model: ReturnType<typeof useModelSelection> };

export function ModelMenu({ model }: Props) {
  const { providers, provider, modelId, modelLabel, choices, loadingModels, levels, effort } =
    model;

  if (!provider) {
    return (
      <Link to="/settings/providers" className="text-xs text-muted-foreground underline">
        Add a provider to choose a model
      </Link>
    );
  }

  const efforts = levels.length > 1;
  const subscription = isSubscription(provider);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label="Model and reasoning effort"
            title={subscription ? `Runs on your ${provider.name}` : provider.name}
            className="border-transparent bg-muted/40 dark:border-transparent dark:bg-muted/40 max-w-full min-w-0 rounded-full px-3 text-muted-foreground"
          />
        }
      >
        <ProviderLogo kind={provider.kind} baseUrl={provider.baseUrl} />
        <span className="truncate font-medium text-foreground">{modelLabel ?? provider.name}</span>
        {efforts && <span className="shrink-0">{effortName(effort)}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-auto min-w-[260px]">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="[&>svg:last-child]:ml-0">
            <IconCpu />
            Model
            <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">
              {modelLabel ?? provider.name}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto">
            {choices.length === 0 ? (
              <DropdownMenuItem disabled>
                {loadingModels ? "Loading models…" : "No models"}
              </DropdownMenuItem>
            ) : (
              providers.flatMap((each) => {
                const group = choices.filter((choice) => choice.provider.id === each.id);

                if (group.length === 0) return [];

                return [
                  <DropdownMenuGroup key={each.id}>
                    <DropdownMenuLabel>{each.name}</DropdownMenuLabel>
                    {group.map((choice) => {
                      const chosen =
                        choice.provider.id === provider.id && choice.modelId === modelId;

                      return (
                        <DropdownMenuItem
                          key={`${choice.provider.id}:${choice.modelId}`}
                          title={choice.label}
                          onClick={() => model.selectModel(choice)}
                        >
                          <span className="min-w-0 flex-1 truncate">{choice.label}</span>
                          {chosen && <IconCheck />}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuGroup>,
                ];
              })
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {efforts && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="[&>svg:last-child]:ml-0">
              <IconBolt />
              Reasoning
              <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">
                {effortName(effort)}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              {levels.map((level) => (
                <DropdownMenuItem key={level} onClick={() => model.selectEffort(level)}>
                  {effortName(level)}
                  {level === effort && <IconCheck className="ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuSeparator className="my-1 bg-border/70" />
        <DropdownMenuItem render={<Link to="/settings/providers" />}>
          <IconSettings />
          {subscription ? "Manage your subscription" : "Manage models"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
