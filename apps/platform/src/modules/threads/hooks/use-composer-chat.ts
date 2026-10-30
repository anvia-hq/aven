import type { ChatController } from "@anvia/react-ui/chat";
import { useMemo } from "react";

const nothing = async () => {};

// Anvia's composer lives inside a chat, which it asks whether it may send and how to stop. A
// thread's runs are the control plane's (SSE, not Anvia's transport), so the composer gets a chat
// that is always ready and sends through its own `submitMessage`; `PromptInput` decides when a
// message can go and what Stop does.
export function useComposerChat(): ChatController {
  return useMemo(
    () => ({
      messages: [],
      events: [],
      contextUsage: undefined,
      suggestions: [],
      setMessages: () => {},
      sendMessage: nothing,
      regenerate: nothing,
      stop: () => {},
      reset: () => {},
      status: "ready",
      error: undefined,
      text: "",
      streamId: undefined,
      isResuming: false,
      resume: nothing,
      interactions: { all: [], pending: [] },
      respondingInteractions: new Set(),
      respondToInteraction: nothing,
    }),
    [],
  );
}
