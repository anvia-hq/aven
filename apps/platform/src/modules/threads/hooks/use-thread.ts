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
import { authClient } from "@/lib/auth-client";

import { messageBody } from "../message-body";
import type {
  ChatMessage,
  OutgoingMessage,
  QuestionAnswer,
  RunSelection,
  SecretChoice,
} from "../types";
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
  const { all, loaded, setRunning: setThreadRunning, refresh } = useThreads();
  const { data: session, isPending } = authClient.useSession();
  const thread = all.find((candidate) => candidate.id === threadId);
  // Only its creator drives a thread; anyone else it was shared with reads it (decision 0084).
  const owned = thread !== undefined && thread.createdBy === session?.user.id;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState(false);
  // When the run in progress started, by this browser's clock; null when none is.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [usage, setUsage] = useState<ThreadUsage | null>(null);
  // Whether the stream has given this thread's snapshot yet: until it has, `usage` is not known to
  // be none, and what hangs on it should hold its place instead of showing nothing.
  const [synced, setSynced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMessages([]);
    setRunning(false);
    setStartedAt(null);
    setUsage(null);
    setSynced(false);
    setError(null);

    const source = new EventSource(`/api/threads/${threadId}/events`);
    source.onmessage = (message) => {
      const event = parseEvent(message.data);
      if (!event) return;
      setMessages((current) => applyEvent(current, event));
      setRunning((current) => isRunning(current, event));
      switch (event.type) {
        case "snapshot":
          setSynced(true);
          setUsage(event.usage ?? null);
          setStartedAt(event.running ? Date.now() - (event.runningMs ?? 0) : null);
          break;
        case "usage":
          setUsage((current) => applyUsage(current, event));
          break;
        case "run_start":
        case "run_resume":
          setError(null);
          setStartedAt(Date.now());
          setThreadRunning(threadId, true);
          break;
        case "error":
          setError(event.message);
          setStartedAt(null);
          setThreadRunning(threadId, false);
          break;
        case "done":
          setStartedAt(null);
          setThreadRunning(threadId, false);
          // What the server does once a run has ended, such as finding the pull request the agent
          // opened, lands a moment after `done`: look now, and again shortly.
          void refresh();
          setTimeout(() => void refresh(), 2000);
          break;
      }
    };
    source.onerror = () => {
      // The browser retries on its own; only a stream it has given up on leaves the run unknown.
      if (source.readyState !== EventSource.CLOSED) return;
      setRunning(false);
      setStartedAt(null);
      setError("Lost the connection to the server");
    };
    return () => source.close();
  }, [threadId, setThreadRunning, refresh]);

  // True once the message is accepted, so the composer knows it can clear.
  const send = useCallback(
    async (message: OutgoingMessage, selection: RunSelection = {}) => {
      const sent = await attempt("Could not send message", async () => {
        await postJson(`/threads/${threadId}/messages`, messageBody(message, selection));
        rememberModelSelection(threadId, selection);
        return true;
      });
      return sent ?? false;
    },
    [threadId],
  );

  // True once the answers are accepted; the run then continues, and the stream shows it.
  const answer = useCallback(
    async (answers: QuestionAnswer[], selection: RunSelection = {}, secret?: SecretChoice) => {
      const sent = await attempt("Could not send answer", async () => {
        await postJson(`/threads/${threadId}/answer`, { answers, ...selection, ...secret });
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

  return {
    thread,
    owned,
    // Whose it is is known once the session is; a session being looked up again (the window
    // regained focus) does not unknown it.
    loaded: loaded && (session != null || !isPending),
    messages,
    running,
    startedAt,
    usage,
    synced,
    error,
    question,
    send,
    answer,
    cancel,
  };
}
