import { getDefaultStore, useAtomValue } from "jotai";
import { useCallback, useEffect } from "react";

import { attempt, postJson } from "@/lib/api";
import { createListStore } from "@/lib/list-store";

import { mentionsAtom } from "../atoms/mentions-atom";
import type { Mention } from "../types";

const LOOK_MS = 15_000;

const mentionsStore = createListStore<Mention>({
  path: "/threads/mentions",
  atom: mentionsAtom,
  label: "mentions",
});

export const refreshMentions = () => mentionsStore.refresh();

export const resetMentions = () => mentionsStore.reset();

export function useMentions() {
  const mentions = useAtomValue(mentionsAtom);

  useEffect(() => {
    void mentionsStore.refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void mentionsStore.refresh();
    }, LOOK_MS);
    window.addEventListener("focus", refreshMentions);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refreshMentions);
    };
  }, []);

  const markAllRead = useCallback(async () => {
    getDefaultStore().set(
      mentionsAtom,
      (current) => current?.map((mention) => ({ ...mention, read: true })) ?? null,
    );
    await attempt("Could not mark the mentions read", () => postJson("/threads/mentions/read", {}));
    await mentionsStore.refresh();
  }, []);

  const list = mentions ?? [];
  return { mentions: list, unread: list.filter((mention) => !mention.read).length, markAllRead };
}
