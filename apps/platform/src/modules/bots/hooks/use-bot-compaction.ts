import { BOT_COMPACT_TOKENS } from "@aven/protocol/bots";
import { useState } from "react";

import { toast } from "@aven/ui/toast";

import type { Bot } from "../types";
import { useBots } from "./use-bots";

const shown = (bot: Bot) => bot.compactAfterTokens?.toString() ?? "";

export function useBotCompaction(bot: Bot) {
  const { update } = useBots();
  const [text, setText] = useState(shown(bot));

  async function commit() {
    const written = text.trim();
    const next = written === "" ? null : Number(written);

    if (next === bot.compactAfterTokens) return;

    const { min, max } = BOT_COMPACT_TOKENS;

    if (next !== null && (!Number.isInteger(next) || next < min || next > max)) {
      toast.add({
        title: "Could not save the bot",
        description: `Use a whole number of tokens from ${min.toLocaleString()} to ${max.toLocaleString()}, or leave it empty`,
        type: "error",
      });
      setText(shown(bot));
      return;
    }

    if (!(await update(bot, { compactAfterTokens: next }))) setText(shown(bot));
  }

  return { text, setText, commit };
}
