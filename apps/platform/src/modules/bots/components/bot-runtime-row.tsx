import { SettingsRow } from "@/components/settings-section";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";
import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";

import type { Bot } from "../types";
import { useBots } from "../hooks/use-bots";

const DEFAULT = "default";

export function BotRuntimeRow({ bot }: { bot: Bot }) {
  const { runtimes } = useRuntimes();
  const { update } = useBots();
  const choices = runtimes.filter((runtime) => runtime.isControlPlane || runtime.host);
  const labels: Record<string, string> = { [DEFAULT]: "Default" };
  for (const runtime of choices) labels[runtime.id] = runtime.name;

  return (
    <SettingsRow
      title="Computer"
      description="The runner where this bot's commands and files live, in a folder of its own under the runner's home (bots/<id>). Default: the server's built-in runner. Its model still runs on the server."
    >
      <Select
        value={bot.runtimeId ?? DEFAULT}
        items={labels}
        onValueChange={(value) => {
          if (!value) return;
          void update(bot, { runtimeId: value === DEFAULT ? null : String(value) });
        }}
      >
        <SelectTrigger aria-label={`Computer of ${bot.name}`} className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="w-auto min-w-(--anchor-width)">
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
