import type { Bot, BotChatMessage, BotChatPeer } from "./types";

export type ChatItem =
  | { type: "message"; key: string; message: BotChatMessage }
  | { type: "activity"; key: string; messages: BotChatMessage[] };

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

export const peerKey = (peer: BotChatPeer) => peer.handle;

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

export function peerBots(peers: readonly BotChatPeer[], bots: readonly Bot[]) {
  const found = peers.map((peer) => {
    const bot = bots.find((each) => each.handle === peer.handle);
    return bot ?? { id: `handle:${peer.handle}`, name: peer.name, avatar: "" };
  });
  return [...new Map(found.map((bot) => [bot.id, bot])).values()];
}

export const peerName = (peer: BotChatPeer, bots: readonly Bot[]) =>
  bots.find((each) => each.handle === peer.handle)?.name ?? peer.name;
