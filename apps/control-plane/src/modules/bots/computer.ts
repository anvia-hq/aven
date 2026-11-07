import { orNotFound } from "../../errors";
import { runnerVia } from "../runtimes/ask-runner";
import { RuntimeOfflineError, type RuntimeHub } from "../runtimes/hub";
import { botsService } from "./service";

export const botRunnerFor = (hub: RuntimeHub, runtimeId: string) =>
  runnerVia(
    async (userId, botId) => {
      await requireOwnBot(userId, botId);
      const found = hub.get(runtimeId);
      if (!found) throw new RuntimeOfflineError("The bot's computer is offline");
      return found;
    },
    { bot: true },
  );

export async function requireOwnBot(userId: string, botId: string) {
  orNotFound(await botsService.get(userId, botId), "Bot not found");
}
