import { applyBotEvent, isTyping } from "@aven/protocol/bots";
import { useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";

import { attempt, postJson } from "@/lib/api";
import { refreshMcpServers } from "@/modules/mcp/hooks/use-mcp-servers";
import { refreshMemory } from "@/modules/memory/hooks/use-memory";
import { refreshProviders } from "@/modules/providers/hooks/use-providers";
import type { AttachmentUpload } from "@/modules/threads/types";

import { botLastMessagesAtom } from "../atoms/bot-last-messages-atom";
import type { BotChatMessage } from "../types";
import { refreshBots } from "./use-bots";
import type { BotEvent } from "@aven/protocol/types";

function parseEvent(data: string): BotEvent | null {
  try {
    return JSON.parse(data) as BotEvent;
  } catch {
    return null;
  }
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
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setLastMessages = useSetAtom(botLastMessagesAtom);

  useEffect(() => {
    setMessages([]);
    setTyping(false);
    setError(null);

    const source = new EventSource(`/api/bots/${botId}/events`);
    source.onmessage = (message) => {
      const event = parseEvent(message.data);

      if (!event) return;

      setMessages((current) => applyBotEvent(current, event));
      setTyping((current) => isTyping(current, event));
      const last = botSaid(event);

      if (last !== undefined) setLastMessages((current) => ({ ...current, [botId]: last }));

      if (event.type === "error") setError(event.message);

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

      if (source.readyState === EventSource.CLOSED) setError("Lost the connection to the server");
    };
    return () => source.close();
  }, [botId, setLastMessages]);

  const send = useCallback(
    async (text: string, attachments: AttachmentUpload[] = [], quote?: string) => {
      const body: { text: string; attachments?: AttachmentUpload[]; quote?: string } = { text };

      if (attachments.length) body.attachments = attachments;

      if (quote) body.quote = quote;

      const sent = await attempt("Could not send message", async () => {
        await postJson(`/bots/${botId}/messages`, body);
        return true;
      });
      return sent ?? false;
    },
    [botId],
  );

  return { messages, typing, error, send };
}
