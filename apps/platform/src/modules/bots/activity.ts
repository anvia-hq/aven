import type { BotChatMessage, BotChatPeer } from "./types";

/** What the chat is made of: a message, or a run of messages between bots shown as one line. */
export type ChatItem =
  | { type: "message"; key: string; message: BotChatMessage }
  | { type: "activity"; key: string; messages: BotChatMessage[] };

// Messages between bots (decision 0063) are not bubbles, as in the Anvia harness: those that follow
// one another make one line that opens to show them.
export function chatItems(messages: readonly BotChatMessage[]): ChatItem[] {
  const items: ChatItem[] = [];
  for (const message of messages) {
    const last = items.at(-1);
    if (!message.peer) {
      items.push({ type: "message", key: message.id, message });
    } else if (last?.type === "activity") {
      last.messages.push(message);
    } else {
      items.push({ type: "activity", key: `activity-${message.id}`, messages: [message] });
    }
  }
  return items;
}

/** The bot a peer is, by id when it is known and by name when it is not. */
export const peerKey = (peer: BotChatPeer) => peer.id ?? `name:${peer.name}`;

/**
 * What a line of messages between bots says: how many, with whom. One message reads as Messaged
 * when this bot wrote it and Heard from when the other did; more read as a count.
 */
export function activitySummary(messages: readonly BotChatMessage[]) {
  const peers = new Map<string, BotChatPeer>();
  for (const { peer } of messages) {
    if (peer && !peers.has(peerKey(peer))) peers.set(peerKey(peer), peer);
  }
  return { lead: leadOf(messages), peers: [...peers.values()] };
}

function leadOf(messages: readonly BotChatMessage[]) {
  if (messages.length > 1) return `${messages.length} messages with`;
  return messages[0]?.peer?.direction === "to" ? "Messaged" : "Heard from";
}
