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
import {
  pendingMessage,
  settlePending,
  withoutPending,
  type PendingMessage,
} from "../pending-messages";
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

export function useThread(threadId: string) {
  const { all, loaded, setRunning: setThreadRunning, refresh } = useThreads();
  const { data: session, isPending } = authClient.useSession();
  const thread = all.find((candidate) => candidate.id === threadId);
  const wasArchived = thread !== undefined && thread.state !== "open";
  const owned = thread !== undefined && thread.createdBy === session?.user.id;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [usage, setUsage] = useState<ThreadUsage | null>(null);
  const [synced, setSynced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steers, setSteersState] = useState<QueuedSteer[]>([]);
  const steersRef = useRef<QueuedSteer[]>([]);
  const changeSteers = useCallback((change: (current: QueuedSteer[]) => QueuedSteer[]) => {
    steersRef.current = change(steersRef.current);
    setSteersState(steersRef.current);
  }, []);

  const [pending, setPendingState] = useState<PendingMessage[]>([]);
  const pendingRef = useRef<PendingMessage[]>([]);
  const changePending = useCallback((change: (current: PendingMessage[]) => PendingMessage[]) => {
    pendingRef.current = change(pendingRef.current);
    setPendingState(pendingRef.current);
  }, []);

  useEffect(() => {
    changeSteers(() => []);
    changePending(() => []);
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
      changePending((current) => settlePending(current, event));
      switch (event.type) {
        case "steer_queued":
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
          setError(event.error ?? null);
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
          void refresh();
          setTimeout(() => void refresh(), 2000);
          break;
      }
    };
    source.onerror = () => {
      if (source.readyState !== EventSource.CLOSED) return;
      setRunning(false);
      setStartedAt(null);
      setError("Lost the connection to the server");
      void refresh();
    };
    return () => source.close();
  }, [threadId, setThreadRunning, refresh, changeSteers, changePending]);

  const send = useCallback(
    async (message: OutgoingMessage, selection: RunSelection = {}) => {
      const id = newSteerId();
      const dropSteer = () => changeSteers((current) => current.filter((steer) => steer.id !== id));
      const dropPending = () => changePending((current) => withoutPending(current, id));
      const steering = running && message.attachments.length === 0;
      if (steering) {
        changeSteers((current) => [
          ...current,
          { id, prompt: message.prompt, mentions: message.mentions },
        ]);
      } else {
        changePending((current) => [...current, pendingMessage(id, message)]);
      }
      const sent = await attempt("Could not send message", async () => {
        const result = await postJson<{ steered: boolean }>(`/threads/${threadId}/messages`, {
          ...messageBody(message, selection),
          steerId: id,
        });
        rememberModelSelection(threadId, selection);
        return result;
      });
      if (!sent?.steered) dropSteer();
      if (!sent || sent.steered || steering) dropPending();
      if (sent && wasArchived) void refresh();
      return sent !== null;
    },
    [threadId, running, changeSteers, changePending, wasArchived, refresh],
  );

  const answer = useCallback(
    async (answers: QuestionAnswer[], selection: RunSelection = {}, secret?: SecretChoice) => {
      const sent = await attempt("Could not send answer", async () => {
        await postJson(`/threads/${threadId}/answer`, { answers, ...selection, ...secret });
        return true;
      });
      if (sent && wasArchived) void refresh();
      return sent ?? false;
    },
    [threadId, wasArchived, refresh],
  );

  const cancel = useCallback(async () => {
    await api(`/threads/${threadId}/cancel`, { method: "POST" }).catch(() => undefined);
  }, [threadId]);

  const question = running ? undefined : pendingQuestion(messages);

  return {
    thread,
    owned,
    loaded: loaded && (session != null || !isPending),
    messages,
    pending: pending.map((item) => item.message),
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
