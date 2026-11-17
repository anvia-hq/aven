import { SettingsRow } from "@/components/settings-section";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@aven/ui/select";
import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";

import type { Bot } from "../types";
import { useBots } from "../hooks/use-bots";

const DEFAULT = "default";
const NONE = "none";

export function BotRuntimeRow({ bot }: { bot: Bot }) {
  const { runtimes } = useRuntimes();
  const { update } = useBots();
  const choices = runtimes;
  const labels: Record<string, string> = {
    [NONE]: "No computer",
    [DEFAULT]: "Default",
  };
  for (const runtime of choices) labels[runtime.id] = runtime.name;

  return (
    <SettingsRow
      title="Computer"
      description="Where this bot's commands and files live, in a folder of its own under the runner's home (bots/<id>). Default is the server's built-in runner. No computer: the bot only talks, and its model still runs on the server."
    >
      <Select
        value={bot.hasComputer ? (bot.runtimeId ?? DEFAULT) : NONE}
        items={labels}
        onValueChange={(value) => {
          if (!value) return;

          if (value === NONE) {
            void update(bot, { hasComputer: false });
            return;
          }

          void update(bot, {
            hasComputer: true,
            runtimeId: value === DEFAULT ? null : String(value),
          });
        }}
      >
        <SelectTrigger aria-label={`Computer of ${bot.name}`} className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="w-auto min-w-(--anchor-width)">
          <SelectItem value={NONE}>No computer</SelectItem>
          <SelectItem value={DEFAULT}>Default</SelectItem>
          {choices.map((runtime) => (
            <SelectItem key={runtime.id} value={runtime.id}>
              {runtime.name}
              {runtime.online ? "" : " (offline)"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsRow>
  );
}
