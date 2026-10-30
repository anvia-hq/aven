import { useNavigate } from "@tanstack/react-router";

import { toast } from "@/components/toast";
import { attempt, postJson } from "@/lib/api";

import type { OutgoingMessage, RunSelection, Thread } from "../types";
import { rememberModelSelection } from "./use-model-selection";
import { messageBody } from "./use-thread";
import { useThreads } from "./use-threads";

const titleFrom = (prompt: string) => (prompt.length > 50 ? `${prompt.slice(0, 47)}...` : prompt);

// A thread started with files only is named after the first of them.
const titleOf = ({ prompt, attachments }: OutgoingMessage) =>
  titleFrom(prompt || attachments[0]?.name || "New thread");

// Creates a thread in a project, sends the first prompt and opens the thread. Resolves to whether
// a thread was created, so the composer keeps the text when it was not. If only the prompt is
// refused (say the runner is offline), the thread still opens, where the failure and a retry are.
export function useStartThread() {
  const navigate = useNavigate();
  const { refresh } = useThreads();

  function createThread(projectId: string, title: string) {
    return attempt("Could not start thread", () =>
      postJson<Thread>("/threads", { projectId, title }),
    );
  }

  async function sendFirstPrompt(
    thread: Thread,
    message: OutgoingMessage,
    selection: RunSelection,
  ) {
    await attempt("The agent did not start", () =>
      postJson(`/threads/${thread.id}/messages`, messageBody(message, selection)),
    );
  }

  // With no project picked yet, nothing is created.
  return async (
    projectId: string | undefined,
    message: OutgoingMessage,
    selection: RunSelection = {},
  ) => {
    if (!projectId) {
      toast.add({ title: "Choose a project first", type: "error" });
      return false;
    }
    const thread = await createThread(projectId, titleOf(message));
    if (!thread) return false;
    rememberModelSelection(thread.id, selection);
    await sendFirstPrompt(thread, message, selection);
    await refresh();
    await navigate({ to: "/threads/$threadId", params: { threadId: thread.id } });
    return true;
  };
}
