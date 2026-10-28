import { applyEvent, isRunning, type RunEvent } from "@aven/agents/protocol";
import { useCallback, useEffect, useState } from "react";

import { toast } from "@/components/toast";
import { api, ApiError, postJson } from "@/lib/api";

import type { ChatMessage } from "../types";
import { useThreads } from "./use-threads";

// A live view of one thread. The server owns the run: this attaches over server-sent events,
// gets a snapshot of the transcript, then applies events as they arrive. Reloading or leaving the
// page never stops the agent, and reattaching shows the run still in progress.
export function useThread(threadId: string) {
  const { threads, loaded, refresh } = useThreads();
  const thread = threads.find((candidate) => candidate.id === threadId);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMessages([]);
    setRunning(false);
    setError(null);

    const source = new EventSource(`/api/threads/${threadId}/events`);
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as RunEvent;
      setMessages((current) => applyEvent(current, event));
      setRunning((current) => isRunning(current, event));
      if (event.type === "error") setError(event.message);
      if (event.type === "run_start") setError(null);
      if (event.type === "done" || event.type === "error") void refresh();
    };
    return () => source.close();
  }, [threadId, refresh]);

  const send = useCallback(
    async (prompt: string) => {
      try {
        await postJson(`/threads/${threadId}/messages`, { prompt });
      } catch (failure) {
        const message =
          failure instanceof ApiError ? failure.message : "Could not reach the server";
        toast.add({ title: "Could not send message", description: message, type: "error" });
      }
    },
    [threadId],
  );

  const cancel = useCallback(async () => {
    await api(`/threads/${threadId}/cancel`, { method: "POST" }).catch(() => undefined);
  }, [threadId]);

  return { thread, loaded, messages, running, error, send, cancel };
}
