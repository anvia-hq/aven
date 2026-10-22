import { useAtomCallback } from "jotai/utils";
import { useCallback } from "react";

import { buildReply, newId } from "../atoms/agent-script";
import { threadsAtom } from "../atoms/threads-atom";
import type { Message, MessagePart, Mode, Thread } from "../types";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useAgent() {
  const send = useAtomCallback(
    useCallback(async (_get, set, input: { threadId: string; prompt: string; mode?: Mode }) => {
      const { threadId, prompt } = input;
      const update = (fn: (thread: Thread) => Thread) =>
        set(threadsAtom, (threads) => threads.map((t) => (t.id === threadId ? fn(t) : t)));
      const patchAssistant = (assistantId: string, fn: (parts: MessagePart[]) => MessagePart[]) =>
        update((t) => ({
          ...t,
          messages: t.messages.map((m) =>
            m.id === assistantId ? { ...m, parts: fn(m.parts) } : m,
          ),
        }));

      const now = () => new Date().toISOString();
      const assistantId = newId();
      const userMessage: Message = {
        id: newId(),
        role: "user",
        createdAt: now(),
        parts: [{ type: "text", text: prompt }],
      };
      const assistantMessage: Message = {
        id: assistantId,
        role: "assistant",
        createdAt: now(),
        parts: [],
      };

      update((t) => ({
        ...t,
        status: "running",
        updatedAt: now(),
        messages: [...t.messages, userMessage, assistantMessage],
      }));

      for (const step of buildReply(prompt)) {
        await wait(450);
        if (step.type === "text") {
          patchAssistant(assistantId, (parts) => [...parts, step]);
          continue;
        }
        patchAssistant(assistantId, (parts) => [...parts, { type: "tool", tool: step.tool }]);
        await wait(550);
        patchAssistant(assistantId, (parts) =>
          parts.map((part) =>
            part.type === "tool" && part.tool.id === step.tool.id
              ? { type: "tool", tool: { ...part.tool, ...step.result, status: "done" } }
              : part,
          ),
        );
      }

      update((t) => ({
        ...t,
        status: "idle",
        updatedAt: now(),
        contextUsed: Math.min(95, t.contextUsed + 6),
      }));
    }, []),
  );

  const create = useAtomCallback(
    useCallback((_get, set, input: { prompt: string; mode: Mode; projectId?: string }) => {
      const threadId = `t-${newId()}`;
      const title = input.prompt.length > 50 ? `${input.prompt.slice(0, 47)}...` : input.prompt;
      const thread: Thread = {
        id: threadId,
        projectId: input.projectId ?? "p-aven",
        state: "open",
        title,
        repo: "aven",
        branch: "main",
        mode: input.mode,
        status: "idle",
        contextUsed: 3,
        updatedAt: new Date().toISOString(),
        messages: [],
      };
      set(threadsAtom, (threads) => [thread, ...threads]);
      return threadId;
    }, []),
  );

  return { send, create };
}
