import { BOT_COMPACT_TOKENS } from "@aven/protocol/bots";

import { Input } from "@aven/ui/input";
import { SettingsRow } from "@/components/settings-section";

import { useBotCompaction } from "../hooks/use-bot-compaction";
import type { Bot } from "../types";

export function BotCompactionRow({ bot }: { bot: Bot }) {
  const { text, setText, commit } = useBotCompaction(bot);

  return (
    <SettingsRow
      title="Summarize the chat after"
      description="Past this many tokens the bot's earlier turns are folded into a summary, so the chat can go on; you still see every message. Empty: when the chat fills 70% of the model's context window."
    >
      <Input
        type="number"
        inputMode="numeric"
        aria-label={`Summarize the chat of ${bot.name} after this many tokens`}
        className="w-36"
        min={BOT_COMPACT_TOKENS.min}
        max={BOT_COMPACT_TOKENS.max}
        step={1000}
        placeholder="Automatic"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </SettingsRow>
  );
}
