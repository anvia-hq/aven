import { BOT_MAX_HOPS, personPrompt, type Bot, type BotEvent } from "@aven/protocol/bots";
import type { BotSent } from "@aven/protocol/runtime-wire";

import { prepareAttachments, type AttachmentBody } from "../../attachments";
import { orNotFound, UnprocessableError } from "../../errors";
import { assertSeesImages, environmentModel, resolveModel } from "../providers/resolve-model";
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

/** A bot's message to another of the person's bots, named by its handle. */
export type BotLetter = {
  userId: string;
  from: Bot;
  /** How many messages between bots led to the reply that wrote this. */
  hops: number;
  handle: string;
  text: string;
  relaysPersonsWord: boolean;
};

// What a person says to a bot, and its chat as events. The bot runs on the model it was given, or
// else the person's default provider, or else the environment's. The runner is given, so `bots`
// does not depend on how a reply is made.
export const createBotChats = (runner: BotRunner) => ({
  // The person's message, with the files they attached (decision 0080): an image goes to the model
  // too, so a model that cannot see one is refused before anything is added to the chat.
  async send(userId: string, botId: string, text: string, files: readonly AttachmentBody[] = []) {
    const bot = orNotFound(await botsService.get(userId, botId), "Bot not found");
    const attachments = prepareAttachments(files);
    const model = await modelOf(userId, bot);
    if (attachments.some((file) => file.image)) await assertSeesImages(model);
    await runner.send(bot, userId, personPrompt(text), model, attachments);
  },

  // A bot writes to another of the person's bots, named by its handle (decision 0065). The message
  // is in both chats, as a message between bots, and the other bot answers in a reply of its own,
  // as it would the person: by writing back, if it has something to say. `hops` is how many
  // messages between bots led to the reply that wrote this, so a chain of them ends.
  async deliver({
    userId,
    from,
    hops,
    handle,
    text,
    relaysPersonsWord,
  }: BotLetter): Promise<BotSent> {
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
    await runner.deliver({
      bot: target,
      userId,
      from,
      text,
      hops: hops + 1,
      relaysPersonsWord,
      model: await modelOf(userId, target),
    });
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
  async greet(userId: string, botId: string, hops: number) {
    const bot = orNotFound(await botsService.get(userId, botId), "Bot not found");
    await runner.wake(bot, userId, GREETING, hops, await modelOf(userId, bot));
  },

  // A schedule is due (decision 0067): the bot is woken with the task as a note, as it is to greet
  // its person, and what it says is in its chat. A note about a thread the bot sent a run to names
  // it, the one thread the reply may follow up (decision 0101).
  async fire(userId: string, botId: string, note: string, aboutThread?: string) {
    const bot = orNotFound(await botsService.get(userId, botId), "Bot not found");
    await runner.wake(bot, userId, note, 0, await modelOf(userId, bot), aboutThread);
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
