import { BOT_ASK_TIMEOUT_MS, type Bot, type BotEvent } from "@aven/protocol/bots";
import type { BotAnswered } from "@aven/protocol/runtime-wire";

import { orNotFound, UnavailableError, UnprocessableError } from "../../errors";
import { environmentModel, resolveModel } from "../providers/resolve-model";
import type { BotRunner } from "./runner";
import { botsService } from "./service";

// The bot's own model, else the person's default, else the environment's.
async function modelOf(userId: string, bot: Bot) {
  return (
    (await resolveModel(userId, {
      providerId: bot.providerId ?? undefined,
      modelId: bot.modelId ?? undefined,
      reasoningEffort: bot.reasoningEffort ?? undefined,
    })) ?? environmentModel()
  );
}

// The answer, or an error that says the bot is still at work when it takes longer than `ms`: its
// reply goes on and is in its chat when it comes.
function within<T>(answer: Promise<T>, ms: number, message: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new UnavailableError(message)), ms);
  });
  return Promise.race([answer, late]).finally(() => clearTimeout(timer));
}

// What a person says to a bot, and its chat as events. The bot runs on the model it was given, or
// else the person's default provider, or else the environment's. The runner is given, so `bots`
// does not depend on how a reply is made.
export const createBotChats = (runner: BotRunner, options: { askTimeoutMs?: number } = {}) => ({
  async send(userId: string, botId: string, text: string) {
    const bot = orNotFound(await botsService.get(userId, botId), "Bot not found");
    await runner.send(bot, userId, text, await modelOf(userId, bot));
  },

  // A bot writes to another of the person's bots and waits for what it says back (decision 0063).
  // The other bot answers as it would the person: in its own chat, with its own memory.
  async ask(userId: string, from: Bot, botId: string, text: string): Promise<BotAnswered> {
    if (botId === from.id) throw new UnprocessableError("A bot cannot message itself");
    const bot = orNotFound(await botsService.get(userId, botId), "No such bot");
    const answered = await within(
      runner.ask(bot, userId, from.name, text, await modelOf(userId, bot)),
      options.askTimeoutMs ?? BOT_ASK_TIMEOUT_MS,
      `${bot.name} has not answered yet and is still working on it; its answer will be in its chat`,
    );
    if (answered.error)
      throw new UnavailableError(`${bot.name} could not answer: ${answered.error}`);
    return { replies: answered.said };
  },

  async *events(
    userId: string,
    botId: string,
    signal: AbortSignal,
  ): AsyncGenerator<BotEvent | null> {
    orNotFound(await botsService.get(userId, botId), "Bot not found");
    yield* runner.events(botId, userId, signal);
  },
});

export type BotChats = ReturnType<typeof createBotChats>;
