import { useNavigate } from "@tanstack/react-router";

import type { Mode } from "../types";
import { useAgent } from "./use-agent";

// Creates a thread from a prompt, opens it and lets the mock agent reply.
export function useStartThread(projectId?: string) {
  const navigate = useNavigate();
  const { create, send } = useAgent();

  return async (prompt: string, mode: Mode) => {
    const threadId = create({ prompt, mode, projectId });
    await navigate({ to: "/threads/$threadId", params: { threadId } });
    void send({ threadId, prompt });
  };
}
