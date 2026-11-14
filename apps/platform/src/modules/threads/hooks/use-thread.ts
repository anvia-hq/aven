import { isDriving } from "@aven/protocol/drivers";
import {
  answerableQuestion,
  applyEvent,
  applyLimits,
  applyUsage,
  isRunning,
} from "@aven/protocol/events";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { toast } from "@aven/ui/toast";
import { api, attempt, postJson } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

import { messageBody } from "../message-body";
import { pendingMessage, pendingShip, settlePending, withoutPending } from "../pending-messages";
import type {
  ChatMessage,
  OutgoingMessage,
  PendingMessage,
  QuestionAnswer,
  QueuedSteer,
  RunSelection,
  SecretChoice,
} from "../types";
import { rememberModelSelection } from "./use-model-selection";
import { useThreads } from "./use-threads";
import type { MessagesPage, RunEvent, ThreadUsage } from "@aven/protocol/types";

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
  const driven = thread !== undefined && !owned && isDriving(thread.drivingUntil);

  const viewerId = session?.user.id ?? "";
  const viewerName = session?.user.name ?? "";
  const ownerId = thread?.createdBy ?? "";
  const ownerName = thread?.createdByName ?? "";
  const viewer = useMemo(
    () => ({ id: viewerId, owned, name: viewerName, ownerId, ownerName }),
    [viewerId, owned, viewerName, ownerId, ownerName],
  );

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [earlier, setEarlier] = useState<ChatMessage[]>([]);
  const [hidden, setHidden] = useState(0);
  const hiddenRef = useRef(0);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
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
    setEarlier([]);
    hiddenRef.current = 0;
    setHidden(0);
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
          hiddenRef.current = event.hidden ?? 0;
          setHidden(hiddenRef.current);
          setEarlier([]);
          changeSteers(() => event.steers ?? []);
          setError(event.error ?? null);
          setThreadRunning(threadId, event.running);
          setSynced(true);
          setUsage((current) =>
            event.usage ? { ...event.usage, limits: event.usage.limits ?? current?.limits } : null,
          );
          setStartedAt(event.running ? Date.now() - (event.runningMs ?? 0) : null);
          break;
        case "usage":
          setUsage((current) => applyUsage(current, event));
          break;
        case "limits":
          setUsage((current) => applyLimits(current, event.limits));
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

  const loadEarlier = useCallback(async () => {
    const before = hiddenRef.current;

    if (before === 0) return;

    setLoadingEarlier(true);
    const page = await attempt("Could not load earlier messages", () =>
      api<MessagesPage>(`/threads/${threadId}/messages?before=${before}`),
    ).finally(() => setLoadingEarlier(false));

    if (!page || hiddenRef.current !== before) return;

    hiddenRef.current = page.hidden;
    setHidden(page.hidden);
    setEarlier((current) => [...page.messages, ...current]);
  }, [threadId]);

  const send = useCallback(
    async (message: OutgoingMessage, selection: RunSelection = {}) => {
      const id = newSteerId();
      const dropSteer = () => changeSteers((current) => current.filter((steer) => steer.id !== id));
      const dropPending = () => changePending((current) => withoutPending(current, id));
      const steering = running;

      if (steering) {
        const queued: QueuedSteer = { id, prompt: message.prompt, mentions: message.mentions };

        if (message.attachments.length > 0) {
          queued.attachments = pendingMessage(id, message).message.attachments;
        }

        changeSteers((current) => [...current, queued]);
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

  const showShip = useCallback(() => {
    const id = newSteerId();
    changePending((current) => [...current, pendingShip(id)]);
    return () => changePending((current) => withoutPending(current, id));
  }, [changePending]);

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

  const asked = answerableQuestion(messages, running, error !== null);
  const question = thread?.awaitingAnswer === false ? undefined : asked;

  return {
    thread,
    owned,
    viewer,
    driven,
    loaded: loaded && (session != null || !isPending),
    messages,
    earlier,
    hidden,
    loadingEarlier,
    loadEarlier,
    pending: pending.map((item) => item.message),
    steers,
    running,
    startedAt,
    usage,
    synced,
    error,
    question,
    send,
    showShip,
    answer,
    cancel,
  };
}
