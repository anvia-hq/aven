import type { MemoryStore } from "@anvia/core";
import type { ModelConfig } from "@aven/agents/model";
import {
  BOT_MESSAGE_MAX,
  BOT_MESSAGES_PER_REPLY,
  parseBotPrompt,
  type Bot,
} from "@aven/protocol/bots";
import type {
  BotGoaled,
  BotGoalParams,
  BotPeer,
  BotQuestioned,
  BotQuestionParams,
  BotScheduled,
  BotScheduleParams,
  BotSendParams,
  BotSent,
  BotMcped,
  BotMcpParams,
  BotProvided,
  BotProviderParams,
  BotSkillParams,
  BotUpdateParams,
  RunSkill,
} from "@aven/protocol/runtime-wire";
import { isGoalRoundNote, type BotGoalView, type GoalAction } from "@aven/protocol/goals";
import type { BotScheduleView } from "@aven/protocol/schedules";

import type { RunGateway } from "../runtimes/gateway";
import { RuntimeOfflineError, type RuntimeHub } from "../runtimes/hub";
import type { BotLetter } from "./chats";
import { answerBotMemory } from "./memory-answer";
import type { BotReplier, BotReplyInput } from "./runner";
import type { UpdateBotBody } from "./schema";
import type { GoalInput } from "../goals/service";
import type { BotMcp } from "../mcp/bot-access";
import { providerKeyQuestion } from "@aven/protocol/providers";

import type { BotProviders } from "../providers/bot-access";
import type { SchedulePatch, ScheduleInput } from "../schedules/service";
import type { NewBot } from "./service";

/** What a reply may do to the person's bots: make one, or change the one it is for. */
export type BotKeeper = {
  list(userId: string): Promise<Bot[]>;
  create(userId: string, bot: NewBot): Promise<Bot>;
  update(userId: string, id: string, changes: UpdateBotBody): Promise<Bot | null>;
  /** `from` writes to another of the person's bots by its handle; `hops` messages between bots led to it (decision 0065). */
  deliver(letter: BotLetter): Promise<BotSent>;
  /** The person's timezone, which a bot's schedules are in unless it says another (decision 0067). */
  timezone(userId: string): Promise<string>;
  /** The person's schedules, which a bot may look at, make, change and delete (decision 0067). */
  schedules: {
    list(userId: string): Promise<BotScheduleView[]>;
    create(userId: string, selfId: string, input: ScheduleInput): Promise<BotScheduleView>;
    update(userId: string, id: string, patch: SchedulePatch): Promise<BotScheduleView>;
    remove(userId: string, id: string): Promise<void>;
  };
  /** A bot's goal, which is its own and only its own, found by the bot (decision 0068). */
  goals: {
    get(botId: string): Promise<BotGoalView | null>;
    start(userId: string, botId: string, input: GoalInput): Promise<BotGoalView>;
    update(botId: string, action: GoalAction, reason?: string): Promise<BotGoalView | null>;
  };
  /** A bot just made says hello to its person, unasked (decision 0063). */
  greet(userId: string, botId: string, hops: number): Promise<void>;
};

/** The skills a bot's reply has: the person's enabled ones and the built-in ones, and their archives (decision 0081). */
export type BotSkills = {
  forRun(userId: string): Promise<RunSkill[]>;
  archive(digest: string): Promise<Uint8Array | undefined>;
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
    private skills: BotSkills,
    private mcp: BotMcp,
    private providers: BotProviders,
  ) {}

  ready(model: ModelConfig) {
    this.#connection();
    this.gateway.check(model);
  }

  async answer({
    bot,
    userId,
    model,
    prompt,
    attachments,
    hops,
    onPersonsWord,
    say,
    ask,
    signal,
  }: BotReplyInput) {
    // A shutdown that came while the reply waited its turn: there is nothing left to answer.
    signal.throwIfAborted();
    // A round of a goal that is no longer active, as when the person paused it while the round
    // waited its turn, is not worked (decision 0068).
    if (isGoalRoundNote(prompt) && (await this.bots.goals.get(bot.id))?.phase !== "active") return;
    // Every bot is told which bots it may write to. Asked before anything is granted, so a failure
    // here leaves nothing to take back.
    const peers = await this.#peersOf(userId, bot.id);
    const timezone = await this.bots.timezone(userId);
    const skills = await this.skills.forRun(userId);
    // The person's MCP servers for bots, which the runner connects for this reply (decision 0085).
    const mcpServers = await this.mcp.forRun(userId);
    const givenMcp = new Set(mcpServers.map((server) => server.id));
    signal.throwIfAborted();
    const connection = this.#connection();
    const replyId = crypto.randomUUID();
    // Throws when the model cannot be used (no key); the runner gets a token, not the key.
    const runModel = this.gateway.issue(replyId, model);
    const ended = Promise.withResolvers<void>();
    // Whether this reply answers the person's word, said by them or passed on by their main bot
    // while it was theirs, is the runner's to say, not the prompt's: a message from `main` that a
    // note-woken or fooled main bot wrote is not the person's (decisions 0065 and 0067). Only
    // their own message, not one a bot passed on, makes a bot.
    const { from, note } = parseBotPrompt(prompt);
    const makesBotsOnTheirWord = onPersonsWord && from === undefined;
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
      // Only the main bot can pass the person's word on, and only while it has it.
      return this.bots.deliver({
        userId,
        from: bot,
        hops,
        handle: to,
        text,
        relaysPersonsWord: bot.isMain && onPersonsWord,
      });
    };
    const sink = {
      say,
      end: (error?: string) => (error ? ended.reject(new Error(error)) : ended.resolve()),
      lost: (error: Error) => ended.reject(error),
      memory: answerBotMemory(this.store, { sessionId: bot.id, userId }),
      create: async ({ name, instruction, description }: NewBot) => {
        if (!bot.isMain) throw new Error("Only your main bot can make bots");
        if (!makesBotsOnTheirWord)
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
        if (!onPersonsWord) {
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
      // The goal is the reply's own bot's. Starting, pausing, resuming and clearing it are the
      // person's to say; finishing it or saying it is blocked is for the person's reply or a note,
      // which a goal's own rounds are, and not for what another bot writes (decision 0068).
      goal: async (params: BotGoalParams): Promise<BotGoaled> => {
        if (params.op === "get") return this.bots.goals.get(bot.id);
        if (params.op === "start") {
          // A goal runs unattended for many rounds, so only the person's own message starts one, as
          // it only makes a bot: not a request a bot passed on, which a page it read may have written.
          if (!makesBotsOnTheirWord) {
            throw new Error("Start a goal only when the person asks you to, in their own message");
          }
          const { objective, checks, maxRounds } = params;
          return this.bots.goals.start(userId, bot.id, { objective, checks, maxRounds });
        }
        const finishing = params.action === "complete" || params.action === "blocked";
        if (finishing && !onPersonsWord && !isGoalRoundNote(prompt)) {
          throw new Error("Change the goal only on the person's word or in a round of it");
        }
        if (!finishing && !onPersonsWord) {
          throw new Error(`Only the person can ${params.action} a goal, in a chat turn`);
        }
        return this.bots.goals.update(bot.id, params.action, params.reason);
      },
      // Only a skill this reply was given, whatever digest the runner asks for, as a run's own.
      skill: async ({ digest }: Omit<BotSkillParams, "replyId">) => {
        const archive = skills.some((skill) => skill.digest === digest)
          ? await this.skills.archive(digest)
          : undefined;
        if (!archive) throw new Error("This reply has no such skill");
        return { data: archive.toBase64() };
      },
      // The person's MCP servers are theirs: any bot may look and say how the ones it was given
      // connected, and only their own message, not a request another bot passed on or a note, may
      // add, change or remove one (decision 0085).
      mcp: async (params: BotMcpParams): Promise<BotMcped> => {
        if (params.op === "list") return this.mcp.list(userId);
        if (params.op === "report") {
          // Only the servers this reply was given, whatever ids the runner names.
          await this.mcp.record(params.results.filter((result) => givenMcp.has(result.id)));
          return null;
        }
        if (!makesBotsOnTheirWord) {
          throw new Error(
            "Change MCP servers only when the person asks you to, in their own message",
          );
        }
        if (params.op === "remove") {
          await this.mcp.remove(userId, params.id);
          return null;
        }
        if (params.op === "update") {
          const { id, name, url, headers, target, enabled } = params;
          return this.mcp.update(userId, id, { name, url, headers, target, enabled });
        }
        const { name, url, headers, target } = params;
        return this.mcp.add(userId, { name, url, headers, target });
      },
      // The person's model providers are theirs: any bot may look, and only their own message may
      // add, change or remove one. A key is never in any of it: the person types it into a masked
      // card that this puts in the chat, once a reply, as for a question (decision 0086).
      provider: async (params: BotProviderParams): Promise<BotProvided> => {
        if (params.op === "list") return this.providers.list(userId);
        if (params.op === "models") return this.providers.models(userId, params.id);
        if (params.op === "askKey") {
          if (note || (!bot.isMain && from !== undefined)) {
            throw new Error("Nobody is there to type a key: this was not the person's message");
          }
          const providerKey = await this.providers.keyFor(userId, params.id);
          if (asked) throw new Error("You have already asked. Stop now and wait for the answer.");
          asked = true;
          ask([providerKeyQuestion(providerKey)]);
          return providerKey;
        }
        if (!makesBotsOnTheirWord) {
          throw new Error(
            "Change providers only when the person asks you to, in their own message",
          );
        }
        if (params.op === "remove") {
          await this.providers.remove(userId, params.id);
          return null;
        }
        if (params.op === "update") {
          const { id, name, baseUrl, modelId, isDefault } = params;
          return this.providers.update(userId, id, { name, baseUrl, modelId, isDefault });
        }
        const { kind, name, baseUrl, modelId, isDefault } = params;
        return this.providers.add(userId, { kind, name, baseUrl, modelId, isDefault });
      },
      // The bot is the reply's, whichever bot the runner might name.
      update: async ({ name, description, instruction }: Omit<BotUpdateParams, "replyId">) => {
        if (!onPersonsWord) {
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
          attachments: attachments?.length ? attachments : undefined,
          skills: skills.length ? skills : undefined,
          mcp: mcpServers.length ? mcpServers : undefined,
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
