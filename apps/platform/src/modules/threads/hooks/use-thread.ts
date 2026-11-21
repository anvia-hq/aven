import { isDriving } from "@aven/protocol/drivers";
import { answerableQuestion } from "@aven/protocol/events";
import type { MessagesPage, RunEvent } from "@aven/protocol/types";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { toast } from "@aven/ui/toast";
import { api, attempt, postJson } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

import { messageBody } from "../message-body";
import { pendingMessage, pendingShip } from "../pending-messages";
import {
  INITIAL_THREAD_STREAM_STATE,
  reduceThreadStream,
  rejectedSteerNotice,
} from "../thread-stream-state";
import type {
  OutgoingMessage,
  QuestionAnswer,
  QueuedSteer,
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
  const driven = thread !== undefined && !owned && isDriving(thread.drivingUntil);

  const viewerId = session?.user.id ?? "";
  const viewerName = session?.user.name ?? "";
  const ownerId = thread?.createdBy ?? "";
  const ownerName = thread?.createdByName ?? "";
  const viewer = useMemo(
    () => ({ id: viewerId, owned, name: viewerName, ownerId, ownerName }),
    [viewerId, owned, viewerName, ownerId, ownerName],
  );

  const [state, dispatch] = useReducer(reduceThreadStream, INITIAL_THREAD_STREAM_STATE);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    dispatch({ type: "reset" });

    const source = new EventSource(`/api/threads/${threadId}/events`);
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    source.onmessage = (message) => {
      const event = parseEvent(message.data);

      if (!event) return;

      const rejected = rejectedSteerNotice(stateRef.current.steers, event);

      if (rejected) {
        toast.add({
          title: "A message was not delivered",
          description: `${rejected.reason}: “${rejected.prompt}”`,
          type: "error",
        });
      }

      dispatch({ type: "event", event, now: Date.now() });

      switch (event.type) {
        case "snapshot":
          setThreadRunning(threadId, event.running);
          break;
        case "run_start":
        case "run_resume":
          setThreadRunning(threadId, true);
          break;
        case "error":
          setThreadRunning(threadId, false);
          break;
        case "done":
          setThreadRunning(threadId, false);
          void refresh();
          clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => void refresh(), 2000);
          break;
      }
    };
    source.onerror = () => {
      if (source.readyState !== EventSource.CLOSED) return;

      dispatch({ type: "connection_lost" });
      void refresh();
    };
    return () => {
      clearTimeout(refreshTimer);
      source.close();
    };
  }, [threadId, setThreadRunning, refresh]);

  const loadEarlier = useCallback(async () => {
    const before = stateRef.current.hidden;

    if (before === 0) return;

    setLoadingEarlier(true);
    const page = await attempt("Could not load earlier messages", () =>
      api<MessagesPage>(`/threads/${threadId}/messages?before=${before}`),
    ).finally(() => setLoadingEarlier(false));

    if (!page) return;

    dispatch({ type: "earlier_loaded", before, messages: page.messages, hidden: page.hidden });
  }, [threadId]);

  const send = useCallback(
    async (message: OutgoingMessage, selection: RunSelection = {}) => {
      const id = newSteerId();
      const steering = stateRef.current.running;

      if (steering) {
        const queued: QueuedSteer = { id, prompt: message.prompt, mentions: message.mentions };

        if (message.attachments.length > 0) {
          queued.attachments = pendingMessage(id, message).message.attachments;
        }

        dispatch({ type: "steer_add", steer: queued });
      } else {
        dispatch({ type: "pending_add", item: pendingMessage(id, message) });
      }

      const sent = await attempt("Could not send message", async () => {
        const result = await postJson<{ steered: boolean }>(`/threads/${threadId}/messages`, {
          ...messageBody(message, selection),
          steerId: id,
        });
        rememberModelSelection(threadId, selection);
        return result;
      });

      if (!sent?.steered) dispatch({ type: "steer_drop", id });

      if (!sent || sent.steered || steering) dispatch({ type: "pending_drop", id });

      if (sent && wasArchived) void refresh();

      return sent !== null;
    },
    [threadId, wasArchived, refresh],
  );

  const showShip = useCallback(() => {
    const id = newSteerId();
    dispatch({ type: "pending_add", item: pendingShip(id) });
    return () => dispatch({ type: "pending_drop", id });
  }, []);

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

  const decline = useCallback(
    async (selection: RunSelection = {}) => {
      const sent = await attempt("Could not decline the question", async () => {
        await postJson(`/threads/${threadId}/decline`, selection);
        return true;
      });

      return sent ?? false;
    },
    [threadId],
  );

  const cancel = useCallback(async () => {
    await api(`/threads/${threadId}/cancel`, { method: "POST" }).catch(() => undefined);
  }, [threadId]);

  const asked = answerableQuestion(state.messages, state.running, state.error !== null);
  const question = thread?.awaitingAnswer === false ? undefined : asked;

  return {
    thread,
    owned,
    viewer,
    driven,
    loaded: loaded && (session != null || !isPending),
    messages: state.messages,
    handoffs: state.handoffs,
    earlier: state.earlier,
    hidden: state.hidden,
    loadingEarlier,
    loadEarlier,
    pending: state.pending.map((item) => item.message),
    steers: state.steers,
    running: state.running,
    startedAt: state.startedAt,
    usage: state.usage,
    synced: state.synced,
    error: state.error,
    question,
    send,
    showShip,
    answer,
    cancel,
    decline,
  };
}
