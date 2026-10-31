import { SettingsEmpty, SettingsList, SettingsRow } from "@/components/settings-section";

import { useBots } from "../hooks/use-bots";
import { BotAvatar } from "./bot-avatar";
import { BotModelSelect } from "./bot-model-select";

// The person's bots, each with the model it talks with.
export function BotsSettingsList() {
  const { bots, loaded } = useBots();

  if (loaded && bots.length === 0) return <SettingsEmpty>You have no bots yet.</SettingsEmpty>;

  return (
    <SettingsList label="Bots">
      {bots.map((bot) => (
        <SettingsRow
          key={bot.id}
          leading={<BotAvatar bot={bot} />}
          title={bot.name}
          description={bot.isMain ? "Your main bot" : undefined}
        >
          <BotModelSelect bot={bot} />
        </SettingsRow>
      ))}
    </SettingsList>
  );
}
