import { useNavigate } from "@tanstack/react-router";

import { toast } from "@/components/toast";
import { ApiError, postJson } from "@/lib/api";

import type { Thread } from "../types";
import { useThreads } from "./use-threads";

const titleFrom = (prompt: string) => (prompt.length > 50 ? `${prompt.slice(0, 47)}...` : prompt);

// Creates a thread in a project, opens it and sends the first prompt.
export function useStartThread() {
  const navigate = useNavigate();
  const { refresh } = useThreads();

  return async (projectId: string, prompt: string) => {
    let thread: Thread;
    try {
      thread = await postJson<Thread>("/threads", { projectId, title: titleFrom(prompt) });
    } catch (failure) {
      const message = failure instanceof ApiError ? failure.message : "Could not reach the server";
      toast.add({ title: "Could not start thread", description: message, type: "error" });
      return;
    }

    await refresh();
    await navigate({ to: "/threads/$threadId", params: { threadId: thread.id } });
    try {
      await postJson(`/threads/${thread.id}/messages`, { prompt });
    } catch (failure) {
      const message = failure instanceof ApiError ? failure.message : "Could not reach the server";
      toast.add({ title: "The agent did not start", description: message, type: "error" });
    }
  };
}
