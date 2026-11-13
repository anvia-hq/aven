import type { Bot, BotChatMessage, BotChatPeer, BotChatQuote } from "./types";

const nameIn = (peer: BotChatPeer, bots: readonly Pick<Bot, "id" | "name" | "handle">[]) =>
  bots.find((bot) => (peer.id !== undefined && bot.id === peer.id) || bot.handle === peer.handle)
    ?.name ??
  (peer.name || peer.handle);

export function quoteAuthor(
  quote: Pick<BotChatQuote, "role" | "peer">,
  chatting: Pick<Bot, "name">,
  bots: readonly Pick<Bot, "id" | "name" | "handle">[],
): string {
  if (quote.peer) return nameIn(quote.peer, bots);

  return quote.role === "user" ? "You" : chatting.name;
}

export function quoteOf(message: BotChatMessage): BotChatQuote {
  return message.peer
    ? { id: message.id, role: message.role, text: message.text, peer: message.peer }
    : { id: message.id, role: message.role, text: message.text };
}
