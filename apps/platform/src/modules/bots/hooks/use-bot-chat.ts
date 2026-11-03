import { applyBotEvent, isTyping, type BotEvent } from "@aven/protocol/bots";
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
    return (
      event.messages.findLast((message) => message.role === "bot" && !message.peer)?.text ?? ""
    );
  }
  // What a bot said to another bot is not what it last said to the person.
  if (event.type === "message" && event.message.role === "bot" && !event.message.peer) {
    return event.message.text;
  }
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
      // A reply that ends may have made a bot or changed one (decisions 0060 and 0061), or changed
      // the person's MCP servers, providers or memory (decisions 0085, 0086 and 0102), and a chat that opens is
      // the first look at what changed while another was open.
      if (event.type === "snapshot" || (event.type === "typing" && !event.typing)) {
        void refreshBots();
        refreshMcpServers();
        refreshProviders();
        refreshMemory();
      }
    };
    source.onerror = () => {
      // The browser retries on its own, and the snapshot it hears again says whether the bot is at
      // work; until then it is not claimed to be. Only a stream it has given up on is lost.
      setTyping(false);
      if (source.readyState === EventSource.CLOSED) setError("Lost the connection to the server");
    };
    return () => source.close();
  }, [botId, setLastMessages]);

  // True once the message is accepted, so the composer knows it can clear. It may carry files
  // (decision 0080), sent with it as a thread's message sends them.
  const send = useCallback(
    async (text: string, attachments: AttachmentUpload[] = []) => {
      const sent = await attempt("Could not send message", async () => {
        await postJson(
          `/bots/${botId}/messages`,
          attachments.length ? { text, attachments } : { text },
        );
        return true;
      });
      return sent ?? false;
    },
    [botId],
  );

  return { messages, typing, error, send };
}
