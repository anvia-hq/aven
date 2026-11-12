import { ChevronRight } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/popover";
import { SettingsRow, SettingsSection } from "@/components/settings-section";
import { Switch } from "@/components/switch";
import { ModelChoiceList } from "@/modules/providers/components/model-choice-list";
import { ProviderLogo } from "@/modules/providers/components/provider-logo";
import { useModelChoices } from "@/modules/providers/hooks/use-model-choices";

import { useFollowUpSettings } from "../hooks/use-follow-up-settings";

export function SmallModelsSection() {
  const { settings, save } = useFollowUpSettings();
  const { providers, choices, loading, labelOf } = useModelChoices();
  const provider = providers.find((item) => item.id === settings?.providerId);
  const modelId = settings?.modelId ?? provider?.modelId ?? null;

  return (
    <SettingsSection
      title="Small models"
      description="A fast, cheap model for small jobs next to the agent. Only affects you."
    >
      <SettingsRow
        title="Follow-up suggestions"
        description="When the agent finishes, suggest two or three replies as buttons. Pressing one sends it."
      >
        <Switch
          aria-label="Follow-up suggestions"
          checked={settings?.enabled ?? false}
          disabled={settings === null || providers.length === 0}
          onCheckedChange={(enabled) => {
            if (!settings) return;
            const fallback = providers.find((item) => item.isDefault) ?? providers[0];
            void save({
              enabled,
              providerId: settings.providerId ?? fallback?.id ?? null,
              modelId: settings.modelId,
            });
          }}
        />
      </SettingsRow>
      <SettingsRow
        title="Model"
        description="Pick a small one: a Haiku-class or mini model is plenty."
      >
        {providers.length === 0 ? (
          <Link to="/settings/providers" className="text-sm text-muted-foreground underline">
            Add a provider first
          </Link>
        ) : (
          <Popover>
            <PopoverTrigger render={<Button variant="outline" size="sm" className="max-w-64" />}>
              {provider && <ProviderLogo kind={provider.kind} />}
              <span className="truncate">
                {provider && modelId ? labelOf(provider.id, modelId) : "Choose a model"}
              </span>
              <ChevronRight />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-3">
              <ModelChoiceList
                providers={providers}
                choices={choices}
                loading={loading}
                selected={provider ? { providerId: provider.id, modelId } : undefined}
                onSelect={(choice) =>
                  void save({
                    enabled: settings?.enabled ?? false,
                    providerId: choice.provider.id,
                    modelId: choice.modelId,
                  })
                }
              />
            </PopoverContent>
          </Popover>
        )}
      </SettingsRow>
    </SettingsSection>
  );
}
