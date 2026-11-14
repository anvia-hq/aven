import { useNavigate } from "@tanstack/react-router";

import { toast } from "@aven/ui/toast";
import { attempt, postJson } from "@/lib/api";

import { handOverFirstPrompt } from "../first-prompt";
import type { OutgoingMessage, RunSelection, Thread } from "../types";
import type { AgentBackendKind } from "@aven/protocol/types";
import { rememberModelSelection } from "./use-model-selection";
import { useThreads } from "./use-threads";

const titleFrom = (prompt: string) => (prompt.length > 50 ? `${prompt.slice(0, 47)}...` : prompt);

const titleOf = ({ prompt, attachments }: OutgoingMessage) =>
  titleFrom(prompt || attachments[0]?.name || "New thread");

export function useStartThread() {
  const navigate = useNavigate();
  const { add, refresh } = useThreads();

  function createThread(projectId: string, title: string, backend: AgentBackendKind) {
    return attempt("Could not start thread", () =>
      postJson<Thread>("/threads", { projectId, title, backend }),
    );
  }

  return async (
    projectId: string | undefined,
    message: OutgoingMessage,
    selection: RunSelection = {},
    backend: AgentBackendKind = "native",
  ) => {
    if (!projectId) {
      toast.add({ title: "Choose a project first", type: "error" });
      return false;
    }

    const thread = await createThread(projectId, titleOf(message), backend);

    if (!thread) return false;

    rememberModelSelection(thread.id, selection);
    add(thread);
    handOverFirstPrompt(thread.id, message, selection);
    await navigate({ to: "/threads/$threadId", params: { threadId: thread.id } });
    void refresh();
    return true;
  };
}
