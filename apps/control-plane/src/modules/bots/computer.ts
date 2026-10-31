import { orNotFound } from "../../errors";
import { runnerVia } from "../runtimes/ask-runner";
import { RuntimeOfflineError, type RuntimeHub } from "../runtimes/hub";
import { botsService } from "./service";

// The runner a bot's computer is on, found through its person: a bot is theirs alone, so `scope`
// is their id, and another person's bot is not found (decision 0059). Every call says it is a
// bot's, for a runner to start a computer that has no repository.
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

/** Resolves when the bot is the person's. */
export async function requireOwnBot(userId: string, botId: string) {
  orNotFound(await botsService.get(userId, botId), "Bot not found");
}
