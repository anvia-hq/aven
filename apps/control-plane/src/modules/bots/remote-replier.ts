import type { MemoryStore } from "@anvia/core";
import type { ModelConfig } from "@aven/agents/model";
import {
  BOT_MESSAGE_MAX,
  BOT_MESSAGES_PER_REPLY,
  MAIN_BOT_HANDLE,
  parseBotPrompt,
  type Bot,
} from "@aven/protocol/bots";
import type {
  BotPeer,
  BotQuestioned,
  BotQuestionParams,
  BotScheduled,
  BotScheduleParams,
  BotSendParams,
  BotSent,
  BotUpdateParams,
} from "@aven/protocol/runtime-wire";
import type { BotScheduleView } from "@aven/protocol/schedules";

import type { RunGateway } from "../runtimes/gateway";
import { RuntimeOfflineError, type RuntimeHub } from "../runtimes/hub";
import { answerBotMemory } from "./memory-answer";
import type { BotReplier, BotReplyInput } from "./runner";
import type { UpdateBotBody } from "./schema";
import type { SchedulePatch, ScheduleInput } from "../schedules/service";
import type { NewBot } from "./service";

/** What a reply may do to the person's bots: make one, or change the one it is for. */
export type BotKeeper = {
  list(userId: string): Promise<Bot[]>;
  create(userId: string, bot: NewBot): Promise<Bot>;
  update(userId: string, id: string, changes: UpdateBotBody): Promise<Bot | null>;
  /** `from` writes to another of the person's bots by its handle; `hops` messages between bots led to it (decision 0065). */
  deliver(userId: string, from: Bot, hops: number, handle: string, text: string): Promise<BotSent>;
  /** The person's timezone, which a bot's schedules are in unless it says another (decision 0067). */
  timezone(userId: string): Promise<string>;
  /** The person's schedules, which a bot may look at, make, change and delete (decision 0067). */
  schedules: {
    list(userId: string): Promise<BotScheduleView[]>;
    create(userId: string, selfId: string, input: ScheduleInput): Promise<BotScheduleView>;
    update(userId: string, id: string, patch: SchedulePatch): Promise<BotScheduleView>;
    remove(userId: string, id: string): Promise<void>;
  };
  /** A bot just made says hello to its person, unasked (decision 0063). */
  greet(userId: string, botId: string, hops: number): Promise<void>;
};

// What a bot that is not the main one tells the main bot when it needs the person to decide: one
// line for each thing the bot wrote, so its names and questions cannot pass for lines of ours.
function relayedQuestion(bot: Bot, questions: BotQuestionParams["questions"]) {
  const line = (text: string) => text.replace(/\s+/g, " ").trim();
  const asked = questions
    .map((question) => {
      const choices = question.choices?.map((choice) => line(choice.label)).join(", ");
      return `- id "${line(question.id)}": ${line(question.text)}${choices ? ` (choices: ${choices})` : ""}`;
    })
    .join("\n");
  // What to do comes before the questions, so that a message cut to fit loses questions, not that.
  const text = `${line(bot.name)} (${bot.handle}) needs a decision from the person to go on. Ask the person with ask_question, offering the same choices, and when they answer, send it to ${bot.handle} with send_message. The questions:\n${asked}`;
  return text.slice(0, BOT_MESSAGE_MAX);
}

// The bot's computer is on a runner, so its agent runs there (decision 0059): it is sent each
// message with a token for its model, says what the bot sends back, and reads and adds to the
// bot's conversation, which stays here, through calls. Every bot works on one runner, the
// control plane's own, which every person has. The person's main bot may also ask for a new bot
// (decision 0060): it is made here, for the person, and no other bot may. Any bot may change its
// own name, description and instruction, and no other bot's (decision 0061), and write to any of
// the person's other bots, as itself (decision 0065).
export class RemoteBotReplier implements BotReplier {
  constructor(
    private hub: Pick<RuntimeHub, "get">,
    private gateway: Pick<RunGateway, "check" | "issue" | "revoke">,
    private store: MemoryStore,
    private runtimeId: string,
    private bots: BotKeeper,
  ) {}

  ready(model: ModelConfig) {
    this.#connection();
    this.gateway.check(model);
  }

  async answer({ bot, userId, model, prompt, hops, say, ask, signal }: BotReplyInput) {
    // A shutdown that came while the reply waited its turn: there is nothing left to answer.
    signal.throwIfAborted();
    // Every bot is told which bots it may write to. Asked before anything is granted, so a failure
    // here leaves nothing to take back.
    const peers = await this.#peersOf(userId, bot.id);
    const timezone = await this.bots.timezone(userId);
    signal.throwIfAborted();
    const connection = this.#connection();
    const replyId = crypto.randomUUID();
    // Throws when the model cannot be used (no key); the runner gets a token, not the key.
    const runModel = this.gateway.issue(replyId, model);
    const ended = Promise.withResolvers<void>();
    // Who this reply answers: only the person's own message, or the main bot passing it on, may
    // change the bot, and only the person's own may make one. What a note or another bot says is
    // not their word, whatever the model makes of it (decision 0065).
    const { from, note } = parseBotPrompt(prompt);
    const personsWord = !note && from === undefined;
    const mainBotsWord = !note && from === MAIN_BOT_HANDLE;
    let written = 0;
    let asked = false;
    // As itself, whichever bot the runner might name, and only so many to a reply.
    const sendToBot = async (to: string, text: string) => {
      if (written >= BOT_MESSAGES_PER_REPLY) {
        throw new Error(
          `You have written to bots ${BOT_MESSAGES_PER_REPLY} times in this reply. Tell the person instead.`,
        );
      }
      written += 1;
      return this.bots.deliver(userId, bot, hops, to, text);
    };
    const sink = {
      say,
      end: (error?: string) => (error ? ended.reject(new Error(error)) : ended.resolve()),
      lost: (error: Error) => ended.reject(error),
      memory: answerBotMemory(this.store, { sessionId: bot.id, userId }),
      create: async ({ name, instruction, description }: NewBot) => {
        if (!bot.isMain) throw new Error("Only your main bot can make bots");
        if (!personsWord)
          throw new Error("Make a bot only when the person asks you to, in their own message");
        const made = await this.bots.create(userId, { name, instruction, description });
        // Not waited for: the new bot's hello is its own reply, in its own chat, and a person with
        // no model to answer with is told that when they speak to it, not now.
        this.bots.greet(userId, made.id, hops).catch((error: unknown) => {
          console.warn(`Bot ${made.id} could not greet its person:`, error);
        });
        return { id: made.id, name: made.name, handle: made.handle };
      },
      // The sender is the reply's bot, whichever bot the runner might name.
      send: ({ to, text }: Omit<BotSendParams, "replyId">) => sendToBot(to, text),
      // The person decides in this bot's chat, or, when a bot that is not the main one answers
      // another bot, the main bot asks them: it is the person's point of contact (decision 0066).
      question: async ({
        questions,
      }: Omit<BotQuestionParams, "replyId">): Promise<BotQuestioned> => {
        if (note) throw new Error("Nobody is there to answer: this was not the person's message");
        // One question a reply: the person answers the first, and the bot goes on from there.
        if (asked) throw new Error("You have already asked. Stop now and wait for the answer.");
        asked = true;
        if (bot.isMain || from === undefined) {
          ask(questions);
          return {};
        }
        const main = (await this.bots.list(userId)).find((other) => other.isMain);
        if (!main) throw new Error("There is no main bot to ask the person");
        const text = relayedQuestion(bot, questions);
        const sent = await sendToBot(main.handle, text);
        return { relayed: { handle: sent.handle, name: sent.name, text } };
      },
      // A person's schedules are theirs: any bot may look, and only their own word, or the main
      // bot's passing it on, may change one. What a note or another bot says is not their word, so
      // a scheduled run cannot make more schedules (decisions 0065 and 0067).
      schedule: async (params: BotScheduleParams): Promise<BotScheduled> => {
        if (params.op === "list") return this.bots.schedules.list(userId);
        if (!personsWord && !mainBotsWord) {
          throw new Error(
            "Change schedules only when the person asks you to, or the main bot passes it on",
          );
        }
        if (params.op === "delete") {
          await this.bots.schedules.remove(userId, params.id);
          return null;
        }
        if (params.op === "update") {
          const { name, cron, prompt, timezone, enabled, bot: target } = params;
          const patch = { name, cron, prompt, timezone, enabled, bot: target };
          return this.bots.schedules.update(userId, params.id, patch);
        }
        const { name, cron, prompt, timezone, bot: target } = params;
        return this.bots.schedules.create(userId, bot.id, {
          name,
          cron,
          prompt,
          timezone,
          bot: target,
        });
      },
      // The bot is the reply's, whichever bot the runner might name.
      update: async ({ name, description, instruction }: Omit<BotUpdateParams, "replyId">) => {
        if (!personsWord && !mainBotsWord) {
          throw new Error(
            "Change yourself only when the person asks you to, or the main bot passes it on",
          );
        }
        const changed = await this.bots.update(userId, bot.id, { name, description, instruction });
        if (!changed) throw new Error("This bot no longer exists");
        return { name: changed.name, description: changed.description };
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
            handle: bot.handle,
            instruction: bot.instruction,
            description: bot.description,
            compactAfterTokens: bot.compactAfterTokens ?? undefined,
            canCreateBots: bot.isMain,
            peers,
            timezone,
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

  async #peersOf(userId: string, selfId: string): Promise<BotPeer[]> {
    const bots = await this.bots.list(userId);
    return bots
      .filter((other) => other.id !== selfId)
      .map(({ handle, name, description }) => ({ handle, name, description }));
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
