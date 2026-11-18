import { activityOf, applyBotEvent, isTyping } from "@aven/protocol/bots";
import { useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { attempt, postJson } from "@/lib/api";
import { refreshMcpServers } from "@/modules/mcp/hooks/use-mcp-servers";
import { refreshMemory } from "@/modules/memory/hooks/use-memory";
import { refreshProviders } from "@/modules/providers/hooks/use-providers";
import type { AttachmentUpload, Handoff } from "@/modules/threads/types";

import { botLastMessagesAtom } from "../atoms/bot-last-messages-atom";
import { handoffOf, newPendingId, pendingMessage, settlePending } from "../pending";
import type { BotChatMessage, BotChatQuote, PendingBotMessage } from "../types";
import { refreshBots } from "./use-bots";
import type { BotEvent } from "@aven/protocol/types";

function parseEvent(data: string): BotEvent | null {
  try {
    return JSON.parse(data) as BotEvent;
  } catch {
    return null;
  }
}

const readAt = new Map<string, number>();

function noteRead(botId: string) {
  const now = Date.now();

  if (now - (readAt.get(botId) ?? 0) < 1000) return;

  readAt.set(botId, now);
  void postJson(`/bots/${botId}/read`, {}).catch((error: unknown) =>
    console.warn("Could not mark the bot read:", error),
  );
}

function botSaid(event: BotEvent) {
  if (event.type === "snapshot") {
    return (
      event.messages.findLast((message) => message.role === "bot" && !message.peer)?.text ?? ""
    );
  }

  if (event.type === "message" && event.message.role === "bot" && !event.message.peer) {
    return event.message.text;
  }

  return undefined;
}

export function useBotChat(botId: string) {
  const [messages, setMessages] = useState<BotChatMessage[]>([]);
  const [pending, setPending] = useState<PendingBotMessage[]>([]);
  const pendingRef = useRef<PendingBotMessage[]>([]);
  const [handoffs, setHandoffs] = useState<Record<string, Handoff>>({});
  const [arrived, setArrived] = useState<ReadonlySet<string>>(new Set());
  const [typing, setTyping] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setLastMessages = useSetAtom(botLastMessagesAtom);

  const changePending = useCallback(
    (change: (current: PendingBotMessage[]) => PendingBotMessage[]) => {
      pendingRef.current = change(pendingRef.current);
      setPending(pendingRef.current);
    },
    [],
  );

  useEffect(() => {
    setMessages([]);
    changePending(() => []);
    setHandoffs({});
    setArrived(new Set());
    setTyping(false);
    setActivity(null);
    setError(null);

    const source = new EventSource(`/api/bots/${botId}/events`);
    source.onmessage = (message) => {
      const event = parseEvent(message.data);

      if (!event) return;

      setMessages((current) => applyBotEvent(current, event));

      if (event.type === "message") {
        const handoff = handoffOf(pendingRef.current, event);

        if (handoff) setHandoffs((current) => ({ ...current, [event.message.id]: handoff }));

        setArrived((current) => new Set(current).add(event.message.id));
      }

      changePending((current) => settlePending(current, event));
      setTyping((current) => isTyping(current, event));
      setActivity((current) => activityOf(current, event));
      const last = botSaid(event);

      if (last !== undefined) setLastMessages((current) => ({ ...current, [botId]: last }));

      if (event.type === "error") setError(event.message);

      if (event.type === "snapshot") noteRead(botId);

      if (event.type === "message" && event.message.role === "bot") {
        noteRead(botId);

        if (event.message.questions?.length) void refreshBots();
      }

      if (event.type === "typing" && event.typing) setError(null);

      if (event.type === "snapshot" || (event.type === "typing" && !event.typing)) {
        void refreshBots();
        refreshMcpServers();
        refreshProviders();
        refreshMemory();
      }
    };
    source.onerror = () => {
      setTyping(false);
      setActivity(null);

      if (source.readyState === EventSource.CLOSED) setError("Lost the connection to the server");
    };
    return () => source.close();
  }, [botId, changePending, setLastMessages]);

  const send = useCallback(
    async (text: string, attachments: AttachmentUpload[] = [], quote?: BotChatQuote) => {
      const id = newPendingId();
      changePending((current) => [...current, pendingMessage(id, text, attachments, quote)]);

      const body: { text: string; attachments?: AttachmentUpload[]; quote?: string } = { text };

      if (attachments.length) body.attachments = attachments;

      if (quote) body.quote = quote.id;

      const sent = await attempt("Could not send message", async () => {
        await postJson(`/bots/${botId}/messages`, body);
        return true;
      });

      if (!sent) changePending((current) => current.filter((item) => item.id !== id));

      return sent ?? false;
    },
    [botId, changePending],
  );

  const shown = useMemo(() => pending.map((item) => item.message), [pending]);

  return { messages, pending: shown, handoffs, arrived, typing, activity, error, send };
}
