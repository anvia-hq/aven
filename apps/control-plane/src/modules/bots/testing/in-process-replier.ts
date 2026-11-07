import type { MemoryStore } from "@anvia/core";
import { typingDelay } from "@aven/agents/bot-delay";
import type { SendMessage } from "@aven/agents/tools/send-message";
import { USER_HANDLE, type Bot } from "@aven/protocol/bots";
import type { BotReplier, CreateBotAgent } from "../types";

export function inProcessReplier(options: {
  store: MemoryStore;
  createAgent: CreateBotAgent;
  pause?: (ms: number, signal?: AbortSignal) => Promise<void>;
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
