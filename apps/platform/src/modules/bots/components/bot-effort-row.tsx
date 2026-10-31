import { SettingsRow } from "@/components/settings-section";
import { EffortSlider } from "@/modules/threads/components/effort-slider";

import { useBotEffort } from "../hooks/use-bot-effort";
import type { Bot } from "../types";

// How hard a bot's model thinks before it answers. Only a bot with a model of its own has one to
// set; a model with a single level has nothing to choose.
export function BotEffortRow({ bot }: { bot: Bot }) {
  const { levels, effort, hasOwnModel, choose } = useBotEffort(bot);

  if (!hasOwnModel) {
    return (
      <SettingsRow
        title="Reasoning effort"
        description="Choose a model above to set how hard it thinks."
      />
    );
  }
  if (levels.length < 2 || !effort) return null;

  return (
    <SettingsRow
      title="Reasoning effort"
      description="How hard the model thinks before it answers: more is slower and costs more."
    >
      <div className="w-64">
        <EffortSlider levels={levels} value={effort} onChange={(level) => void choose(level)} />
      </div>
    </SettingsRow>
  );
}
