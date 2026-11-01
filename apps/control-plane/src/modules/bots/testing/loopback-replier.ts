import type { MemoryStore } from "@anvia/core";
import type { BotMemoryParams } from "@aven/protocol/runtime-wire";
import { BotReplies, type CreateBotReplyAgent } from "@aven/runtime-client/bot-replies";

import { answerBotMemory } from "../memory-answer";
import type { BotReplier } from "../runner";

// FOR TESTS ONLY: answers with the runner's own code (`BotReplies`), with the wire between it and
// the control plane short-circuited: what the runner says is what the chat shows, and what it asks
// of the conversation is answered from `store` as the control plane would (decision 0059). It tests
// the two halves together, a real store included, where `inProcessReplier` tests only the chat.
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
          // No computer: the bot only talks.
          sandbox: {
            acquire: async () => ({ tools: [], hasRunningProcesses: async () => false }),
            desktop: () => undefined,
            workspace: async () => undefined,
            release: async () => undefined,
            dispose: async () => undefined,
          },
          createAgent: options.createAgent,
          send: (frame) => {
            if (frame.type === "bot.say") say(frame.text);
            if (frame.type === "bot.end") {
              if (frame.error) reject(new Error(frame.error));
              else resolve();
            }
            return true;
          },
          call: async (_method, params) => memory(params as BotMemoryParams),
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
          },
          prompt,
          model: { provider: "openai", gatewayPath: "/g", gatewayToken: "t" },
        });
      }),
  };
}
