import {
  applyEvent,
  applyUsage,
  isRunning,
  pendingQuestion,
  type RunEvent,
  type ThreadUsage,
} from "@aven/protocol/events";
import { useCallback, useEffect, useState } from "react";

import { api, attempt, postJson } from "@/lib/api";

import type { ChatMessage, QuestionAnswer, RunSelection } from "../types";
import { rememberModelSelection } from "./use-model-selection";
import { useThreads } from "./use-threads";

function parseEvent(data: string): RunEvent | null {
  try {
    return JSON.parse(data) as RunEvent;
  } catch {
    return null;
  }
}

// A live view of one thread. The server owns the run: this attaches over server-sent events,
// gets a snapshot of the transcript, then applies events as they arrive. Reloading or leaving the
// page never stops the agent, and reattaching shows the run still in progress.
export function useThread(threadId: string) {
  const { threads, loaded, setRunning: setThreadRunning } = useThreads();
  const thread = threads.find((candidate) => candidate.id === threadId);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [usage, setUsage] = useState<ThreadUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMessages([]);
    setRunning(false);
    setUsage(null);
    setError(null);

    const source = new EventSource(`/api/threads/${threadId}/events`);
    source.onmessage = (message) => {
      const event = parseEvent(message.data);
      if (!event) return;
      setMessages((current) => applyEvent(current, event));
      setRunning((current) => isRunning(current, event));
      switch (event.type) {
        case "snapshot":
          setUsage(event.usage ?? null);
          break;
        case "usage":
          setUsage((current) => applyUsage(current, event));
          break;
        case "run_start":
        case "run_resume":
          setError(null);
          setThreadRunning(threadId, true);
          break;
        case "error":
          setError(event.message);
          setThreadRunning(threadId, false);
          break;
        case "done":
          setThreadRunning(threadId, false);
          break;
      }
    };
    source.onerror = () => {
      // The browser retries on its own; only a stream it has given up on leaves the run unknown.
      if (source.readyState !== EventSource.CLOSED) return;
      setRunning(false);
      setError("Lost the connection to the server");
    };
    return () => source.close();
  }, [threadId, setThreadRunning]);

  // True once the message is accepted, so the composer knows it can clear.
  const send = useCallback(
    async (prompt: string, selection: RunSelection = {}) => {
      const sent = await attempt("Could not send message", async () => {
        await postJson(`/threads/${threadId}/messages`, { prompt, ...selection });
        rememberModelSelection(threadId, selection);
        return true;
      });
      return sent ?? false;
    },
    [threadId],
  );

  // True once the answers are accepted; the run then continues, and the stream shows it.
  const answer = useCallback(
    async (answers: QuestionAnswer[], selection: RunSelection = {}) => {
      const sent = await attempt("Could not send answer", async () => {
        await postJson(`/threads/${threadId}/answer`, { answers, ...selection });
        return true;
      });
      return sent ?? false;
    },
    [threadId],
  );

  const cancel = useCallback(async () => {
    await api(`/threads/${threadId}/cancel`, { method: "POST" }).catch(() => undefined);
  }, [threadId]);

  // The question the agent stopped on, until it is answered.
  const question = running ? undefined : pendingQuestion(messages);

  return { thread, loaded, messages, running, usage, error, question, send, answer, cancel };
}
