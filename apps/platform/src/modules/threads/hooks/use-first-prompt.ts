import { useEffect, useRef } from "react";

import { takeFirstPrompt } from "../first-prompt";
import type { OutgoingMessage, RunSelection, SendMessageOptions } from "../types";

export function useFirstPrompt(
  threadId: string,
  send: (
    message: OutgoingMessage,
    selection: RunSelection,
    options?: SendMessageOptions,
  ) => Promise<boolean>,
) {
  const latest = useRef(send);
  latest.current = send;
  useEffect(() => {
    const timer = setTimeout(() => {
      const first = takeFirstPrompt(threadId);

      if (first) void latest.current(first.message, first.selection, { sandbox: first.sandbox });
    }, 0);
    return () => clearTimeout(timer);
  }, [threadId]);
}
