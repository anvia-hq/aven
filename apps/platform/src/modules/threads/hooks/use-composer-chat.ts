import type { ChatController } from "@anvia/react-ui/chat";
import { useMemo } from "react";

const nothing = async () => {};

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
