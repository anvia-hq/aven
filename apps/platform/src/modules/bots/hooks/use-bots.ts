import { getDefaultStore, useAtom } from "jotai";
import { useEffect } from "react";

import { toast } from "@/components/toast";
import { attempt, postJson } from "@/lib/api";
import { createListStore } from "@/lib/list-store";

import { botLastMessagesAtom } from "../atoms/bot-last-messages-atom";
import { botsAtom } from "../atoms/bots-atom";
import type { Bot, BotPatch } from "../types";

const botsStore = createListStore<Bot>({ path: "/bots", atom: botsAtom, label: "bots" });

// Fetches the list again, for a change made elsewhere: a bot the main bot made, or one that renamed
// itself, shows up this way.
export const refreshBots = () => botsStore.refresh();

// Bots belong to the signed-in user, so drop them on sign-out; the next user refetches.
export function resetBots() {
  botsStore.reset();
  getDefaultStore().set(botLastMessagesAtom, {});
}

// The user's bots, and their main one. Loads on first use; the first load makes the main bot.
export function useBots() {
  const [bots] = useAtom(botsAtom);

  useEffect(() => {
    if (bots === null) void botsStore.refresh();
  }, [bots]);

  // False on failure (already toasted). `quiet` skips the confirmation, for a change made in small
  // steps, such as a slider.
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
