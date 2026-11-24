import { useNavigate } from "@tanstack/react-router";

import { toast } from "@aven/ui/toast";
import { attempt, postJson } from "@/lib/api";
import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";
import { isSandbox } from "@/modules/runtimes/sandbox";

import { handOverFirstPrompt } from "../first-prompt";
import type { OutgoingMessage, RunSelection, Thread } from "../types";
import { rememberModelSelection } from "./use-model-selection";
import { useThreads } from "./use-threads";

const titleFrom = (prompt: string) => (prompt.length > 50 ? `${prompt.slice(0, 47)}...` : prompt);

const titleOf = ({ prompt, attachments }: OutgoingMessage) =>
  titleFrom(prompt || attachments[0]?.name || "New thread");

export function useStartThread() {
  const navigate = useNavigate();
  const { add, refresh } = useThreads();
  const { computers, refresh: refreshRuntimes } = useRuntimes();

  function createThread(
    projectId: string,
    title: string,
    providerId: string | undefined,
    runtimeId: string | undefined,
  ) {
    return attempt("Could not start thread", () =>
      postJson<Thread>("/threads", { projectId, runtimeId, title, providerId }),
    );
  }

  return async (
    projectId: string | undefined,
    message: OutgoingMessage,
    selection: RunSelection = {},
    runtimeId?: string,
  ) => {
    if (!projectId) {
      toast.add({ title: "Choose a project first", type: "error" });
      return false;
    }

    const chosen = computers.find((candidate) => candidate.id === runtimeId);
    const sandbox = isSandbox(chosen);
    const thread = await createThread(projectId, titleOf(message), selection.providerId, runtimeId);

    if (!thread) return false;

    rememberModelSelection(thread.id, selection);
    add(thread);
    handOverFirstPrompt(thread.id, message, selection, { sandbox });

    if (sandbox || thread.runtimeId !== runtimeId) void refreshRuntimes();

    await navigate({ to: "/threads/$threadId", params: { threadId: thread.id } });
    void refresh();
    return true;
  };
}
