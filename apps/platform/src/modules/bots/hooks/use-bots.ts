import { getDefaultStore, useAtom } from "jotai";
import { useEffect } from "react";

import { toast } from "@/components/toast";
import { attempt, postJson } from "@/lib/api";
import { createListStore } from "@/lib/list-store";

import { botLastMessagesAtom } from "../atoms/bot-last-messages-atom";
import { botsAtom } from "../atoms/bots-atom";
import type { Bot, BotPatch } from "../types";

const botsStore = createListStore<Bot>({ path: "/bots", atom: botsAtom, label: "bots" });

export const refreshBots = () => botsStore.refresh();

export function resetBots() {
  botsStore.reset();
  getDefaultStore().set(botLastMessagesAtom, {});
}

export function useBots() {
  const [bots] = useAtom(botsAtom);

  useEffect(() => {
    if (bots === null) void botsStore.refresh();
  }, [bots]);

  async function update(bot: Bot, patch: BotPatch, { quiet = false } = {}) {
    const saved = await attempt("Could not save the bot", () =>
      postJson<Bot>(`/bots/${bot.id}`, patch, "PATCH"),
    );

    if (!saved) return false;

    await botsStore.refresh();

    if (!quiet) toast.add({ title: "Bot saved", description: saved.name, type: "success" });

    return true;
  }

  return {
    bots: bots ?? [],
    main: bots?.find((bot) => bot.isMain),
    loaded: bots !== null,
    update,
  };
}
