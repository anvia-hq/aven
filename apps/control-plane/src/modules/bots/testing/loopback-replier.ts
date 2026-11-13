import type { MemoryStore } from "@anvia/core";
import { BotReplies } from "@aven/runtime-client/bot-replies";
import { noProcesses } from "@aven/runtime-client/thread-processes";

import { answerBotMemory } from "../memory-answer";
import type { BotReplier } from "../types";
import type { BotMemoryParams } from "@aven/protocol/types";
import type { CreateBotReplyAgent } from "@aven/runtime-client/types";

export function loopbackReplier(options: {
  store: MemoryStore;
  createAgent: CreateBotReplyAgent;
}): BotReplier {
  return {
    ready: () => undefined,
    answer: ({ bot, userId, prompt, say, signal }) =>
      new Promise<void>((resolve, reject) => {
        const replyId = crypto.randomUUID();
        const memory = answerBotMemory(options.store, { sessionId: bot.id, userId });
        const replies = new BotReplies({
          sandbox: {
            acquire: async () => ({
              tools: [],
              hasRunningProcesses: async () => false,
              processes: noProcesses,
            }),
            workspace: async () => undefined,
            release: async () => undefined,
            dispose: async () => undefined,
          },
          createAgent: options.createAgent,
          send: (frame) => {
            if (frame.type === "bot.say") say(frame.text, frame.quote);

            if (frame.type === "bot.end") {
              if (frame.error) reject(new Error(frame.error));
              else resolve();
            }

            return true;
          },
          call: async (method, params) =>
            method === "bot.react"
              ? { messageId: (params as { messageId: string }).messageId }
              : memory(params as BotMemoryParams),
          boxes: new Map(),
          starting: async () => undefined,
          finished: () => undefined,
          pause: async () => undefined,
        });
        signal.addEventListener("abort", () => replies.cancel(replyId, "Shutting down"), {
          once: true,
        });
        replies.start({
          type: "bot.reply",
          replyId,
          bot: {
            id: bot.id,
            name: bot.name,
            handle: bot.handle,
            instruction: bot.instruction,
            description: bot.description,
            compactAfterTokens: bot.compactAfterTokens ?? undefined,
            canCreateBots: false,
            peers: [],
            timezone: "UTC",
          },
          prompt,
          model: { provider: "openai", gatewayPath: "/g", gatewayToken: "t" },
        });
      }),
  };
}
