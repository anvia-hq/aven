import {
  applyEvent,
  applyUsage,
  isRunning,
  pendingQuestion,
  type RunEvent,
  type ThreadUsage,
} from "@aven/protocol/events";
import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "@/components/toast";
import { api, attempt, postJson } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

import { messageBody } from "../message-body";
import type {
  ChatMessage,
  OutgoingMessage,
  QueuedSteer,
  QuestionAnswer,
  RunSelection,
  SecretChoice,
} from "../types";
import { rememberModelSelection } from "./use-model-selection";
import { useThreads } from "./use-threads";

// A name for a message the agent has not taken yet, which the server and the other tabs use to tell
// it from the others. `randomUUID` is only there on a secure origin, a plain-HTTP address has none.
function newSteerId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}

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
  // What was said while the agent worked and it has not taken yet (decision 0098). Kept in a ref as
  // well, so an event that drops one can say what it was.
  const [steers, setSteersState] = useState<QueuedSteer[]>([]);
  const steersRef = useRef<QueuedSteer[]>([]);
  const changeSteers = useCallback((change: (current: QueuedSteer[]) => QueuedSteer[]) => {
    steersRef.current = change(steersRef.current);
    setSteersState(steersRef.current);
  }, []);

  useEffect(() => {
    changeSteers(() => []);
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
        case "steer_queued":
          // Shown already by the browser that sent it, which named it.
          changeSteers((current) =>
            current.some(({ id }) => id === event.id)
              ? current
              : [...current, { id: event.id, prompt: event.prompt, mentions: event.mentions }],
          );
          break;
        case "steer":
          changeSteers((current) => current.filter(({ id }) => id !== event.id));
          break;
        case "steer_rejected": {
          const lost = steersRef.current.find(({ id }) => id === event.id);
          changeSteers((current) => current.filter(({ id }) => id !== event.id));
          // With a reason the person has not been told: say what was lost, so it can be sent again.
          if (lost && event.reason) {
            toast.add({
              title: "A message was not delivered",
              description: `${event.reason}: “${lost.prompt}”`,
              type: "error",
            });
          }
          break;
        }
        case "snapshot":
          changeSteers(() => event.steers ?? []);
          // What the sidebar shows of this thread is brought to what the server says now: a run
          // may have ended while no stream was listening to it.
          setThreadRunning(threadId, event.running);
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
      // Whether it still runs is not known from here: the list is asked.
      void refresh();
    };
    return () => source.close();
  }, [threadId, setThreadRunning, refresh, changeSteers]);

  // True once the message is accepted, so the composer knows it can clear. While the agent works
  // the message goes to it, to be read at its next step (decision 0098): it shows at once, as
  // waiting, and becomes the person's message when the agent takes it. It goes away again if it
  // was not taken, or was sent as a message of its own because the run ended first.
  const send = useCallback(
    async (message: OutgoingMessage, selection: RunSelection = {}) => {
      const id = newSteerId();
      const drop = () => changeSteers((current) => current.filter((steer) => steer.id !== id));
      if (running && message.attachments.length === 0) {
        changeSteers((current) => [
          ...current,
          { id, prompt: message.prompt, mentions: message.mentions },
        ]);
      }
      const sent = await attempt("Could not send message", async () => {
        const result = await postJson<{ steered: boolean }>(`/threads/${threadId}/messages`, {
          ...messageBody(message, selection),
          steerId: id,
        });
        rememberModelSelection(threadId, selection);
        return result;
      });
      if (!sent?.steered) drop();
      return sent !== null;
    },
    [threadId, running, changeSteers],
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
    steers,
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
