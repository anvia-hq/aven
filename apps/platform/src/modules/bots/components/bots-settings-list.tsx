import { SettingsEmpty, SettingsRow, SettingsSection } from "@/components/settings-section";

import { useBots } from "../hooks/use-bots";
import { BotCompactionRow } from "./bot-compaction-row";
import { BotEffortRow } from "./bot-effort-row";
import { BotModelSelect } from "./bot-model-select";

// The person's bots, each with the settings of how it thinks: its model, how hard it reasons and
// when its chat is summarized.
export function BotsSettingsList() {
  const { bots, loaded } = useBots();

  if (loaded && bots.length === 0) return <SettingsEmpty>You have no bots yet.</SettingsEmpty>;

  return (
    <>
      {bots.map((bot) => (
        <SettingsSection
          key={bot.id}
          title={bot.name}
          description={bot.isMain ? "Your main bot" : undefined}
        >
          <div role="list" aria-label={`${bot.name} settings`} className="flex flex-col">
            <SettingsRow title="Model" description="Any model of your providers, or your default.">
              <BotModelSelect bot={bot} />
            </SettingsRow>
            <BotEffortRow bot={bot} />
            <BotCompactionRow bot={bot} />
          </div>
        </SettingsSection>
      ))}
    </>
  );
}
