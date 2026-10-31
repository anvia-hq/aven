import type { BotEvent } from "@aven/protocol/bots";

import { orNotFound } from "../../errors";
import { environmentModel, resolveModel } from "../providers/resolve-model";
import type { BotRunner } from "./runner";
import { botsService } from "./service";

// What a person says to a bot, and its chat as events. The bot runs on the model it was given, or
// else the person's default provider, or else the environment's. The runner is given, so `bots`
// does not depend on how a reply is made.
export const createBotChats = (runner: BotRunner) => ({
  async send(userId: string, botId: string, text: string) {
    const bot = orNotFound(await botsService.get(userId, botId), "Bot not found");
    // The bot's own model, else the person's default, else the environment's.
    const model =
      (await resolveModel(userId, {
        providerId: bot.providerId ?? undefined,
        modelId: bot.modelId ?? undefined,
      })) ?? environmentModel();
    await runner.send(bot, userId, text, model);
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
