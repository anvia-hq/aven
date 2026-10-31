import { applyBotEvent, isTyping, type BotEvent } from "@aven/protocol/bots";
import { useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";

import { attempt, postJson } from "@/lib/api";

import { botLastMessagesAtom } from "../atoms/bot-last-messages-atom";
import type { BotChatMessage } from "../types";

function parseEvent(data: string): BotEvent | null {
  try {
    return JSON.parse(data) as BotEvent;
  } catch {
    return null;
  }
}

// What the bot said last, as far as an event tells; nothing when it tells nothing of that.
function botSaid(event: BotEvent) {
  if (event.type === "snapshot") {
    return event.messages.findLast((message) => message.role === "bot")?.text ?? "";
  }
  if (event.type === "message" && event.message.role === "bot") return event.message.text;
  return undefined;
}

// A live view of a bot's chat. The server owns the reply: this attaches over server-sent events,
// gets the chat, then adds each message as the bot sends it. Leaving the page loses nothing.
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
      // What the bot said last, for the sidebar.
      const last = botSaid(event);
      if (last !== undefined) setLastMessages((current) => ({ ...current, [botId]: last }));
      if (event.type === "error") setError(event.message);
      if (event.type === "typing" && event.typing) setError(null);
    };
    source.onerror = () => {
      // The browser retries on its own; only a stream it has given up on is lost.
      if (source.readyState !== EventSource.CLOSED) return;
      setTyping(false);
      setError("Lost the connection to the server");
    };
    return () => source.close();
  }, [botId, setLastMessages]);

  // True once the message is accepted, so the composer knows it can clear.
  const send = useCallback(
    async (text: string) => {
      const sent = await attempt("Could not send message", async () => {
        await postJson(`/bots/${botId}/messages`, { text });
        return true;
      });
      return sent ?? false;
    },
    [botId],
  );

  return { messages, typing, error, send };
}
