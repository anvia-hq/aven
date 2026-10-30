import { useNavigate } from "@tanstack/react-router";

import { toast } from "@/components/toast";
import { errorMessage, postJson } from "@/lib/api";

import type { RunSelection, Thread } from "../types";
import { rememberModelSelection } from "./use-model-selection";
import { useThreads } from "./use-threads";

const titleFrom = (prompt: string) => (prompt.length > 50 ? `${prompt.slice(0, 47)}...` : prompt);

// Creates a thread in a project, sends the first prompt and opens the thread. Resolves to whether
// a thread was created, so the composer keeps the text when it was not. If only the prompt is
// refused (say the runner is offline), the thread still opens, where the failure and a retry are.
export function useStartThread() {
  const navigate = useNavigate();
  const { refresh } = useThreads();

  async function createThread(projectId: string, prompt: string) {
    try {
      return await postJson<Thread>("/threads", { projectId, title: titleFrom(prompt) });
    } catch (failure) {
      toast.add({
        title: "Could not start thread",
        description: errorMessage(failure),
        type: "error",
      });
      return null;
    }
  }

  async function sendFirstPrompt(thread: Thread, prompt: string, selection: RunSelection) {
    try {
      await postJson(`/threads/${thread.id}/messages`, { prompt, ...selection });
    } catch (failure) {
      toast.add({
        title: "The agent did not start",
        description: errorMessage(failure),
        type: "error",
      });
    }
  }

  return async (projectId: string, prompt: string, selection: RunSelection = {}) => {
    const thread = await createThread(projectId, prompt);
    if (!thread) return false;
    rememberModelSelection(thread.id, selection);
    await sendFirstPrompt(thread, prompt, selection);
    await refresh();
    await navigate({ to: "/threads/$threadId", params: { threadId: thread.id } });
    return true;
  };
}
