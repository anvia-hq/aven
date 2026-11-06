import { useEffect, useRef } from "react";

import { takeFirstPrompt } from "../first-prompt";
import type { OutgoingMessage, RunSelection } from "../types";

// Sends the first message of a thread this browser just made (decision 0126), which the screen that
// made it left here, so it is shown at once as any message sent from the thread is. Sent on the
// next tick, and taken then, so an effect that runs twice in development sends it once and after
// the conversation has reset itself.
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
