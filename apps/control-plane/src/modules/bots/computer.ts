import { orNotFound } from "../../errors";
import { runnerVia } from "../runtimes/ask-runner";
import type { RuntimeHub } from "../runtimes/hub";
import { reachRunner } from "../runtimes/providers";
import { botsService } from "./service";

export const botRunnerFor = (hub: RuntimeHub, runtimeId: string) =>
  runnerVia(
    async (userId, botId) => {
      await requireOwnBot(userId, botId);
      return reachRunner(hub, { runtimeId }, "The bot's computer is offline");
    },
    { bot: true },
  );

export async function requireOwnBot(userId: string, botId: string) {
  orNotFound(await botsService.get(userId, botId), "Bot not found");
}
