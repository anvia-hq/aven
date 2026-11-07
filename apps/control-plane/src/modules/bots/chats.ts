import { BOT_MAX_HOPS, personPrompt, type Bot, type BotEvent } from "@aven/protocol/bots";
import type { BotSent } from "@aven/protocol/runtime-wire";

import { prepareAttachments, type AttachmentBody } from "../../attachments";
import { orNotFound, UnprocessableError } from "../../errors";
import { assertSeesImages, environmentModel, resolveModel } from "../providers/resolve-model";
import type { BotRunner } from "./runner";
import { botsService } from "./service";
import type { BotLetter } from "./types";

const GREETING =
  "You were just created. Introduce yourself to the person now: a short hello, who you are, and what you can do for them, in one or two short messages. You may end with one easy question to get started. Do not mention this note.";

async function modelOf(userId: string, bot: Bot) {
  return (
    (await resolveModel(userId, {
      providerId: bot.providerId ?? undefined,
      modelId: bot.modelId ?? undefined,
      reasoningEffort: bot.reasoningEffort ?? undefined,
    })) ?? environmentModel()
  );
}

export const createBotChats = (runner: BotRunner) => ({
  async send(userId: string, botId: string, text: string, files: readonly AttachmentBody[] = []) {
    const bot = orNotFound(await botsService.get(userId, botId), "Bot not found");
    const attachments = prepareAttachments(files);
    const model = await modelOf(userId, bot);
    if (attachments.some((file) => file.image)) await assertSeesImages(model);
    await runner.send(bot, userId, personPrompt(text), model, attachments);
  },

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

  async greet(userId: string, botId: string, hops: number) {
    const bot = orNotFound(await botsService.get(userId, botId), "Bot not found");
    await runner.wake(bot, userId, GREETING, hops, await modelOf(userId, bot));
  },

  async fire(userId: string, botId: string, note: string, aboutThread?: string) {
    const bot = orNotFound(await botsService.get(userId, botId), "Bot not found");
    await runner.wake(bot, userId, note, 0, await modelOf(userId, bot), aboutThread);
  },

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
