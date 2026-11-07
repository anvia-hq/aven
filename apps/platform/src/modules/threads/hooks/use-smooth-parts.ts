import { useSmoothStreamItems, type SmoothStreamItemAdapter } from "@anvia/react";
import { useMemo } from "react";

import type { ChatMessage, MessagePart } from "../types";

type Item = { key: string; part: MessagePart };

const paced = (part: MessagePart): part is Extract<MessagePart, { text: string }> =>
  part.type === "text" || part.type === "reasoning";

const adapter: SmoothStreamItemAdapter<Item> = {
  getKey: (item) => item.key,
  getText: (item) => (paced(item.part) ? item.part.text : undefined),
  withText: (item, text) => (paced(item.part) ? { ...item, part: { ...item.part, text } } : item),
};

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
