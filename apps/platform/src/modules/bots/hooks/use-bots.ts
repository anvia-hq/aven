import { useAtom } from "jotai";
import { useEffect } from "react";

import { attempt, postJson } from "@/lib/api";
import { createListStore } from "@/lib/list-store";

import { botsAtom } from "../atoms/bots-atom";
import type { Bot, BotPatch } from "../types";

const botsStore = createListStore<Bot>({ path: "/bots", atom: botsAtom, label: "bots" });

// Bots belong to the signed-in user, so drop them on sign-out; the next user refetches.
export const resetBots = botsStore.reset;

// The user's bots, and their main one. Loads on first use; the first load makes the main bot.
export function useBots() {
  const [bots] = useAtom(botsAtom);

  useEffect(() => {
    if (bots === null) void botsStore.refresh();
  }, [bots]);

  // False on failure (already toasted).
  async function update(bot: Bot, patch: BotPatch) {
    const saved = await attempt("Could not save the bot", () =>
      postJson<Bot>(`/bots/${bot.id}`, patch, "PATCH"),
    );
    if (saved) await botsStore.refresh();
    return saved !== null;
  }

  return {
    bots: bots ?? [],
    main: bots?.find((bot) => bot.isMain),
    loaded: bots !== null,
    update,
  };
}
