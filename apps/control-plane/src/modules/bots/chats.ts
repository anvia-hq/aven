import { BOT_MAX_HOPS, personPrompt, type Bot, type BotEvent } from "@aven/protocol/bots";
import type { BotSent } from "@aven/protocol/runtime-wire";

import { orNotFound, UnprocessableError } from "../../errors";
import { environmentModel, resolveModel } from "../providers/resolve-model";
import type { BotRunner } from "./runner";
import { botsService } from "./service";

// What a bot just made is told, in a note: the harness's words for it.
const GREETING =
  "You were just created. Introduce yourself to the person now: a short hello, who you are, and what you can do for them, in one or two short messages. You may end with one easy question to get started. Do not mention this note.";

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

// What a person says to a bot, and its chat as events. The bot runs on the model it was given, or
// else the person's default provider, or else the environment's. The runner is given, so `bots`
// does not depend on how a reply is made.
export const createBotChats = (runner: BotRunner) => ({
  async send(userId: string, botId: string, text: string) {
    const bot = orNotFound(await botsService.get(userId, botId), "Bot not found");
    await runner.send(bot, userId, personPrompt(text), await modelOf(userId, bot));
  },

  // A bot writes to another of the person's bots, named by its handle (decision 0065). The message
  // is in both chats, as a message between bots, and the other bot answers in a reply of its own,
  // as it would the person: by writing back, if it has something to say. `hops` is how many
  // messages between bots led to the reply that wrote this, so a chain of them ends.
  async deliver(
    userId: string,
    from: Bot,
    hops: number,
    handle: string,
    text: string,
  ): Promise<BotSent> {
    const target = await botsService.getByHandle(userId, handle);
    if (!target) {
      throw new UnprocessableError(`No bot with the handle "${handle}". Use list_bots, or "user".`);
    }
    if (target.id === from.id) throw new UnprocessableError("A bot cannot message itself");
    if (hops + 1 > BOT_MAX_HOPS) {
      throw new UnprocessableError(
        "Too many bot-to-bot messages in a row. Message the person instead.",
      );
    }
    await runner.deliver(target, userId, from, text, hops + 1, await modelOf(userId, target));
    runner.note(from.id, "bot", text, {
      id: target.id,
      name: target.name,
      handle: target.handle,
      direction: "to",
    });
    return { handle: target.handle, name: target.name };
  },

  // A bot that was just made says hello to its person (decision 0063), unasked: the app wakes it
  // with a note the chat does not show. No model, or no runner, and it stays quiet until spoken to.
  async greet(userId: string, botId: string) {
    const bot = orNotFound(await botsService.get(userId, botId), "Bot not found");
    await runner.wake(bot, userId, GREETING, await modelOf(userId, bot));
  },

  // Which of the person's bots are at work, as it changes.
  working: (userId: string, signal: AbortSignal) => runner.working(userId, signal),

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
