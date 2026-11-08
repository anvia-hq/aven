import { useState } from "react";

import { useLocalStorage } from "@/hooks/use-local-storage";
import { useRequest } from "@/hooks/use-request";
import { toast } from "@/components/toast";
import { attempt, postJson } from "@/lib/api";
import { forgetStoredKeysStartingWith, registerUserState } from "@/lib/user-state";
import type { ThreadAction } from "@aven/protocol/types";

import { useModelSelection } from "./use-model-selection";

const FAVORITES_PREFIX = "aven.actions.favorites.";

type Answer = { actions: ThreadAction[]; problem: string | null };

registerUserState(() => forgetStoredKeysStartingWith(FAVORITES_PREFIX));

export function useThreadActions(threadId: string, projectId: string, running: boolean) {
  const [favorites, setFavorites] = useLocalStorage<string[]>(
    `${FAVORITES_PREFIX}${projectId}`,
    [],
  );
  const [starting, setStarting] = useState<string | null>(null);
  const { selection } = useModelSelection(threadId);
  const answer = useRequest<Answer>(`/threads/${threadId}/actions`, {
    resetOn: threadId,
    refreshKey: running,
  });

  async function start(action: ThreadAction) {
    setStarting(action.name);
    const started = await attempt(`Could not start ${action.name}`, () =>
      postJson<{ kind: "run" | "prompt" }>(`/threads/${threadId}/actions`, {
        name: action.name,
        ...selection,
      }),
    );
    setStarting(null);
    if (!started) return;
    toast.add({
      title: action.name,
      description:
        started.kind === "run"
          ? "Running in the sandbox, under Background tasks"
          : "The agent is working on it in this thread",
      type: "success",
    });
  }

  function toggleFavorite(name: string) {
    setFavorites((current) =>
      current.includes(name) ? current.filter((kept) => kept !== name) : [...current, name],
    );
  }

  return {
    favorites,
    toggleFavorite,
    actions: answer?.data?.actions ?? [],
    problem: answer?.data?.problem ?? null,
    starting,
    start,
  };
}
