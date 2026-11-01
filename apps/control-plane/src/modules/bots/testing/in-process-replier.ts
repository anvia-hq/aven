import type { AgentMemoryOptions, MemoryStore } from "@anvia/core";
import type { createBotAgent } from "@aven/agents/bot-agent";
import { typingDelay } from "@aven/agents/bot-delay";
import type { AskQuestion } from "@aven/agents/tools/ask-question";
import type { SendMessage } from "@aven/agents/tools/send-message";
import type { ModelConfig } from "@aven/agents/model";
import { USER_HANDLE, type Bot } from "@aven/protocol/bots";

import type { BotReplier } from "../runner";

type BotAgent = Pick<ReturnType<typeof createBotAgent>, "generate">;

/** Makes the agent of one message. A test makes its own with a scripted model. */
export type CreateBotAgent = (input: {
  bot: Bot;
  model: ModelConfig;
  send: SendMessage;
  /** Asks the person to decide, as the chat shows it. */
  askQuestion: AskQuestion;
  memory: AgentMemoryOptions;
}) => BotAgent;

// FOR TESTS ONLY: answers in this process, with an agent a test made, where a bot is answered on a
// runner in production (decision 0059). It is for what the chat does with replies: their order, the
// events, what is kept. How a runner answers is tested with the runner.
export function inProcessReplier(options: {
  store: MemoryStore;
  createAgent: CreateBotAgent;
  pause?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** What a bot writing to another bot does; without it, none can. */
  sendToBot?: (message: {
    from: Bot;
    userId: string;
    hops: number;
    to: string;
    text: string;
  }) => Promise<string>;
}): BotReplier {
  const pause = options.pause ?? (async () => undefined);
  return {
    ready: () => undefined,
    answer: async ({ bot, userId, model, prompt, hops, say, ask, signal }) => {
      const send: SendMessage = async ({ to, text }, { abortSignal }) => {
        if (to !== USER_HANDLE) {
          if (!options.sendToBot) throw new Error(`No bot with the handle "${to}"`);
          return options.sendToBot({ from: bot, userId, hops, to, text });
        }
        await pause(typingDelay(text), abortSignal);
        say(text);
        return "Sent to the person.";
      };
      const agent = options.createAgent({
        bot,
        model,
        send,
        askQuestion: async (questions) => (ask(questions), {}),
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
