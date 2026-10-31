import type { MemoryStore } from "@anvia/core";
import type { ModelConfig } from "@aven/agents/model";
import type { Bot } from "@aven/protocol/bots";

import type { RunGateway } from "../runtimes/gateway";
import { RuntimeOfflineError, type RuntimeHub } from "../runtimes/hub";
import { answerBotMemory } from "./memory-answer";
import type { BotReplier, BotReplyInput } from "./runner";
import type { NewBot } from "./service";

// The bot's computer is on a runner, so its agent runs there (decision 0059): it is sent each
// message with a token for its model, says what the bot sends back, and reads and adds to the
// bot's conversation, which stays here, through calls. Every bot works on one runner, the
// control plane's own, which every person has. The person's main bot may also ask for a new bot
// (decision 0060): it is made here, for the person, and no other bot may.
export class RemoteBotReplier implements BotReplier {
  constructor(
    private hub: Pick<RuntimeHub, "get">,
    private gateway: Pick<RunGateway, "check" | "issue" | "revoke">,
    private store: MemoryStore,
    private runtimeId: string,
    private makeBot: (userId: string, bot: NewBot) => Promise<Bot>,
  ) {}

  ready(model: ModelConfig) {
    this.#connection();
    this.gateway.check(model);
  }

  async answer({ bot, userId, model, prompt, say, signal }: BotReplyInput) {
    // A shutdown that came while the reply waited its turn: there is nothing left to answer.
    signal.throwIfAborted();
    const connection = this.#connection();
    const replyId = crypto.randomUUID();
    // Throws when the model cannot be used (no key); the runner gets a token, not the key.
    const runModel = this.gateway.issue(replyId, model);
    const ended = Promise.withResolvers<void>();
    const sink = {
      say,
      end: (error?: string) => (error ? ended.reject(new Error(error)) : ended.resolve()),
      lost: (error: Error) => ended.reject(error),
      memory: answerBotMemory(this.store, { sessionId: bot.id, userId }),
      create: async ({ name, instruction, avatar }: NewBot) => {
        if (!bot.isMain) throw new Error("Only your main bot can make bots");
        const made = await this.makeBot(userId, { name, instruction, avatar });
        return { id: made.id, name: made.name };
      },
    };
    const cancel = () => this.#cancel(replyId, signal);
    try {
      connection.startBotReply(
        replyId,
        {
          bot: {
            id: bot.id,
            name: bot.name,
            instruction: bot.instruction,
            compactAfterTokens: bot.compactAfterTokens ?? undefined,
            canCreateBots: bot.isMain,
          },
          prompt,
          model: runModel,
        },
        sink,
      );
      signal.addEventListener("abort", cancel, { once: true });
      await ended.promise;
    } finally {
      signal.removeEventListener("abort", cancel);
      this.gateway.revoke(replyId);
    }
  }

  #connection() {
    const connection = this.hub.get(this.runtimeId);
    if (!connection) throw new RuntimeOfflineError("The bot's computer is offline");
    return connection;
  }

  // The runner ends a cancelled reply itself, with `bot.end`; a runner that is gone has nothing to stop.
  #cancel(replyId: string, signal: AbortSignal) {
    try {
      this.hub.get(this.runtimeId)?.cancelBotReply(replyId, errorOf(signal));
    } catch {
      // The connection closed: the reply is lost, which ends it.
    }
  }
}

const errorOf = (signal: AbortSignal) =>
  signal.reason instanceof Error ? signal.reason.message : "The reply was cancelled";
