import type { AgentMemoryOptions, MemoryStore } from "@anvia/core";
import type { createBotAgent } from "@aven/agents/bot-agent";
import { typingDelay } from "@aven/agents/bot-delay";
import type { DeliverMessage } from "@aven/agents/tools/send-message";
import type { ModelConfig } from "@aven/agents/model";
import type { Bot } from "@aven/protocol/bots";

import type { BotReplier } from "../runner";

type BotAgent = Pick<ReturnType<typeof createBotAgent>, "generate">;

/** Makes the agent of one message. A test makes its own with a scripted model. */
export type CreateBotAgent = (input: {
  bot: Bot;
  model: ModelConfig;
  deliver: DeliverMessage;
  memory: AgentMemoryOptions;
}) => BotAgent;

// FOR TESTS ONLY: answers in this process, with an agent a test made, where a bot is answered on a
// runner in production (decision 0059). It is for what the chat does with replies: their order, the
// events, what is kept. How a runner answers is tested with the runner.
export function inProcessReplier(options: {
  store: MemoryStore;
  createAgent: CreateBotAgent;
  pause?: (ms: number, signal?: AbortSignal) => Promise<void>;
}): BotReplier {
  const pause = options.pause ?? (async () => undefined);
  return {
    ready: () => undefined,
    answer: async ({ bot, userId, model, prompt, say, signal }) => {
      const deliver: DeliverMessage = async (message, { abortSignal }) => {
        await pause(typingDelay(message), abortSignal);
        say(message);
      };
      const agent = options.createAgent({
        bot,
        model,
        deliver,
        memory: { store: options.store, savePolicy: "turn" },
      });
      await agent.generate({
        prompt,
        session: { sessionId: bot.id, userId },
        abortSignal: signal,
      });
    },
  };
}
