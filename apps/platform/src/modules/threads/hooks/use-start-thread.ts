import { useNavigate } from "@tanstack/react-router";

import { toast } from "@/components/toast";
import { attempt, postJson } from "@/lib/api";

import { handOverFirstPrompt } from "../first-prompt";
import type { OutgoingMessage, RunSelection, Thread } from "../types";
import { rememberModelSelection } from "./use-model-selection";
import { useThreads } from "./use-threads";

const titleFrom = (prompt: string) => (prompt.length > 50 ? `${prompt.slice(0, 47)}...` : prompt);

// A thread started with files only is named after the first of them.
const titleOf = ({ prompt, attachments }: OutgoingMessage) =>
  titleFrom(prompt || attachments[0]?.name || "New thread");

// Creates a thread in a project and opens it at once, with the first prompt shown as sent: the
// thread's page sends it (decision 0126), so nothing waits on the message or on the list. Resolves
// to whether a thread was created, so the composer keeps the text when it was not. If only the
// prompt is refused (say the runner is offline), the thread is open already, where the failure is.
export function useStartThread() {
  const navigate = useNavigate();
  const { add, refresh } = useThreads();

  function createThread(projectId: string, title: string) {
    return attempt("Could not start thread", () =>
      postJson<Thread>("/threads", { projectId, title }),
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
    add(thread);
    handOverFirstPrompt(thread.id, message, selection);
    await navigate({ to: "/threads/$threadId", params: { threadId: thread.id } });
    void refresh();
    return true;
  };
}
