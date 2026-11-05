import { useSmoothStreamItems, type SmoothStreamItemAdapter } from "@anvia/react";
import { useMemo } from "react";

import type { ChatMessage, MessagePart } from "../types";

type Item = { key: string; part: MessagePart };

// Reasoning is paced like text (decision 0115): it streams in the same bursts.
const paced = (part: MessagePart): part is Extract<MessagePart, { text: string }> =>
  part.type === "text" || part.type === "reasoning";

const adapter: SmoothStreamItemAdapter<Item> = {
  getKey: (item) => item.key,
  getText: (item) => (paced(item.part) ? item.part.text : undefined),
  withText: (item, text) => (paced(item.part) ? { ...item, part: { ...item.part, text } } : item),
};

// A message's parts as the reader should see them while the agent writes it: text paced out at a
// steady rate whatever bursts it arrives in (some providers send many tokens at once, half a second
// apart: decision 0028), and a part after it shown once the text before it has caught up. Paced
// over the whole message, which exists before its text does, so a new block's first burst is paced
// too. When the message stops streaming, what is held back drains quickly (`draining`); a message
// that was complete when first shown appears at once.
export function useSmoothParts(message: ChatMessage, streaming: boolean) {
  const items = useMemo(
    () => message.parts.map((part, index) => ({ key: String(index), part })),
    [message.parts],
  );
  const smooth = useSmoothStreamItems(items, {
    adapter,
    isStreaming: streaming,
    resetKey: message.id,
  });
  const parts = useMemo(() => smooth.items.map((item) => item.part), [smooth.items]);
  return { parts, draining: smooth.isDraining };
}
