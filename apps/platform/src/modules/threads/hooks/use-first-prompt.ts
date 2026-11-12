import { useEffect, useRef } from "react";

import { takeFirstPrompt } from "../first-prompt";
import type { OutgoingMessage, RunSelection } from "../types";

export function useFirstPrompt(
  threadId: string,
  send: (message: OutgoingMessage, selection: RunSelection) => Promise<boolean>,
) {
  const latest = useRef(send);
  latest.current = send;
  useEffect(() => {
    const timer = setTimeout(() => {
      const first = takeFirstPrompt(threadId);

      if (first) void latest.current(first.message, first.selection);
    }, 0);
    return () => clearTimeout(timer);
  }, [threadId]);
}
