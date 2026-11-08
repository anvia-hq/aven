import { useState } from "react";

import { useRequest } from "@/hooks/use-request";
import { toast } from "@/components/toast";
import { attempt, postJson } from "@/lib/api";
import type { ThreadAction } from "@aven/protocol/types";

import { useModelSelection } from "./use-model-selection";

type Answer = { actions: ThreadAction[]; problem: string | null };

export function useThreadActions(threadId: string, running: boolean) {
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

  return {
    actions: answer?.data?.actions ?? [],
    problem: answer?.data?.problem ?? null,
    starting,
    start,
  };
}
