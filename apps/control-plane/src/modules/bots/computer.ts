import { orNotFound, UnavailableError } from "@aven/server-kit/errors";
import { runnerVia } from "../runtimes/ask-runner";
import type { RuntimeHub } from "../runtimes/hub";
import { reachRunner } from "../runtimes/providers";
import { NO_COMPUTER } from "./talk-replier";
import { botsService } from "./service";

export const botRunnerFor = (hub: RuntimeHub, defaultRuntimeId: string) =>
  runnerVia(
    async (userId, botId) => {
      const bot = await requireOwnBot(userId, botId);

      if (!bot.hasComputer) throw new UnavailableError(NO_COMPUTER);

      return reachRunner(
        hub,
        { runtimeId: bot.runtimeId ?? defaultRuntimeId },
        "The bot's computer is offline",
      );
    },
    { bot: true },
  );

export async function requireOwnBot(userId: string, botId: string) {
  return orNotFound(await botsService.get(userId, botId), "Bot not found");
}
