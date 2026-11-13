import type { MemoryStore } from "@anvia/core";
import { BOT_MESSAGE_MAX, BOT_MESSAGES_PER_REPLY, parseBotPrompt } from "@aven/protocol/bots";
import { providerKeyQuestion } from "@aven/protocol/providers";
import { BOT_THREAD_RUNS_PER_REPLY } from "@aven/protocol/threads";
import { isGoalRoundNote } from "@aven/protocol/goals";
import { isWebhookNote } from "@aven/protocol/webhooks";

import type { RunGateway } from "../runtimes/gateway";
import { RuntimeOfflineError, type RuntimeHub } from "../runtimes/hub";
import { LOCAL_RUNTIME_ID } from "../runtimes/service";
import { API_CALLS_PER_REPLY } from "../bot-api/service";
import { answerBotMemory } from "./memory-answer";
import { runCockpitCommand } from "../cockpit/commands";
import type {
  BotKeeper,
  BotMemoryNotes,
  BotReplier,
  BotReplyInput,
  BotSkills,
  NewBot,
} from "./types";
import type { BotMcp } from "../mcp/types";
import type { BotProviders } from "../providers/types";
import type { BotThreads } from "../threads/types";
import type { ModelConfig } from "@aven/agents/types";
import type {
  Bot,
  BotGoaled,
  BotGoalParams,
  BotMcped,
  BotMcpParams,
  BotNotesParams,
  BotPeer,
  BotProvided,
  BotProviderParams,
  BotQuestioned,
  BotQuestionParams,
  BotReactParams,
  BotScheduled,
  BotScheduleParams,
  BotSendParams,
  BotSkillParams,
  BotThreaded,
  BotApiParams,
  BotApiResult,
  BotThreadParams,
  BotUpdateParams,
} from "@aven/protocol/types";

function relayedQuestion(bot: Bot, questions: BotQuestionParams["questions"]) {
  const line = (text: string) => text.replace(/\s+/g, " ").trim();
  const asked = questions
    .map((question) => {
      const choices = question.choices?.map((choice) => line(choice.label)).join(", ");
      return `- id "${line(question.id)}": ${line(question.text)}${choices ? ` (choices: ${choices})` : ""}`;
    })
    .join("\n");
  const text = `${line(bot.name)} (${bot.handle}) needs a decision from the person to go on. Ask the person with ask_question, offering the same choices, and when they answer, send it to ${bot.handle} with send_message. The questions:\n${asked}`;
  return text.slice(0, BOT_MESSAGE_MAX);
}

export class RemoteBotReplier implements BotReplier {
  constructor(
    private hub: Pick<RuntimeHub, "get">,
    private gateway: Pick<RunGateway, "check" | "issue" | "revoke">,
    private store: MemoryStore,
    private defaultRuntimeId: string,
    private bots: BotKeeper,
    private skills: BotSkills,
    private mcp: BotMcp,
    private providers: BotProviders,
    private threads: BotThreads,
    private notes: BotMemoryNotes,
    private agentOnControlPlane = true,
  ) {}

  ready(model: ModelConfig, bot: Pick<Bot, "runtimeId">) {
    this.#place(this.#runtimeOf(bot));
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
    aboutThread,
    say,
    ask,
    react,
    signal,
  }: BotReplyInput) {
    signal.throwIfAborted();

    if (isGoalRoundNote(prompt) && (await this.bots.goals.get(bot.id))?.phase !== "active") return;

    if (bot.runtimeId) await this.bots.usableRuntime(userId, bot.runtimeId);

    const peers = await this.#peersOf(userId, bot.id);
    const timezone = await this.bots.timezone(userId);
    const skills = await this.skills.forRun(userId);
    const mcpServers = await this.mcp.forRun(userId);
    const givenMcp = new Set(mcpServers.map((server) => server.id));
    const memoryOwner = { userId, botId: bot.id };
    const keepsNotes = onPersonsWord;
    const folders = await this.notes.folders(memoryOwner);
    signal.throwIfAborted();
    const runtimeId = this.#runtimeOf(bot);
    const { connection, machine } = this.#place(runtimeId);
    const replyId = crypto.randomUUID();
    const runModel = this.gateway.issue(replyId, model);
    const ended = Promise.withResolvers<void>();
    const { from, note } = parseBotPrompt(prompt);
    const makesBotsOnTheirWord = onPersonsWord && from === undefined;
    const onWebhook = bot.isMain && isWebhookNote(prompt);
    let written = 0;
    let asked = false;
    let threadRuns = 0;
    let apiCalls = 0;
    const inspected = new Set<string>();
    const sendToBot = async (to: string, text: string) => {
      if (written >= BOT_MESSAGES_PER_REPLY) {
        throw new Error(
          `You have written to bots ${BOT_MESSAGES_PER_REPLY} times in this reply. Tell the person instead.`,
        );
      }

      written += 1;
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
      react: async ({ messageId, emoji }: Omit<BotReactParams, "replyId">) =>
        react(messageId, emoji),
      memory: answerBotMemory(this.store, { sessionId: bot.id, userId }),
      create: async ({ name, instruction, description }: NewBot) => {
        if (!bot.isMain) throw new Error("Only your main bot can make bots");

        if (!makesBotsOnTheirWord)
          throw new Error("Make a bot only when the person asks you to, in their own message");

        const made = await this.bots.create(userId, { name, instruction, description });
        this.bots.greet(userId, made.id, hops).catch((error: unknown) => {
          console.warn(`Bot ${made.id} could not greet its person:`, error);
        });
        return { id: made.id, name: made.name, handle: made.handle };
      },
      send: ({ to, text }: Omit<BotSendParams, "replyId">) => sendToBot(to, text),
      question: async ({
        questions,
      }: Omit<BotQuestionParams, "replyId">): Promise<BotQuestioned> => {
        if (note) throw new Error("Nobody is there to answer: this was not the person's message");

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
      goal: async (params: BotGoalParams): Promise<BotGoaled> => {
        if (params.op === "get") return this.bots.goals.get(bot.id);

        if (params.op === "start") {
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
      skill: async ({ digest }: Omit<BotSkillParams, "replyId">) => {
        const archive = skills.some((skill) => skill.digest === digest)
          ? await this.skills.archive(digest)
          : undefined;

        if (!archive) throw new Error("This reply has no such skill");

        return { data: archive.toBase64() };
      },
      mcp: async (params: BotMcpParams): Promise<BotMcped> => {
        if (params.op === "list") return this.mcp.list(userId);

        if (params.op === "report") {
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
      api: async (params: BotApiParams): Promise<BotApiResult> => {
        if (params.op === "call") {
          apiCalls += 1;

          if (apiCalls > API_CALLS_PER_REPLY) {
            throw new Error(
              `You have made ${API_CALLS_PER_REPLY} API calls in this reply. Tell the person what is left.`,
            );
          }
        }

        return this.bots.api.answer({ userId, params, onPersonsWord: makesBotsOnTheirWord });
      },
      thread: async (params: BotThreadParams): Promise<BotThreaded> => {
        if (params.op === "projects") return this.threads.projects(userId);

        if (params.op === "list") {
          return this.threads.list(userId, {
            projectId: params.projectId,
            archived: params.archived,
          });
        }

        if (params.op === "get") {
          const seen = await this.threads.get(userId, params.id);
          inspected.add(params.id);
          return seen;
        }

        const via = makesBotsOnTheirWord ? "person" : "note";

        if (via === "note") {
          this.#mayFollowUp(params, { note, aboutThread, inspected, webhook: onWebhook });
        }

        const actor = { userId, botId: bot.id, via } as const;

        if (params.op === "archive") {
          return this.threads.archive(actor, params.id, params.archived ?? true);
        }

        if (threadRuns >= BOT_THREAD_RUNS_PER_REPLY) {
          throw new Error(
            `You have started, continued or stopped threads ${BOT_THREAD_RUNS_PER_REPLY} times in this reply. Tell the person what is left.`,
          );
        }

        threadRuns += 1;

        if (params.op === "stop") return this.threads.stop(actor, params.id);

        const { prompt, providerId, modelId, reasoningEffort } = params;
        const choice = { prompt, providerId, modelId, reasoningEffort };

        if (params.op === "continue") return this.threads.continue(actor, params.id, choice);

        return this.threads.start(actor, {
          ...choice,
          projectId: params.projectId,
          title: params.title,
        });
      },
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
      notes: ({ command }: Omit<BotNotesParams, "replyId">) =>
        this.notes.run(
          { owner: memoryOwner, actor: { source: "bot", botId: bot.id }, writable: keepsNotes },
          command,
        ),
      cockpit: ({ command }: { command: unknown }) =>
        runCockpitCommand({ userId, access: "write", onPersonsWord }, command),
    };
    const cancel = () => this.#cancel(replyId, signal, runtimeId);
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
          memory: { folders, writable: keepsNotes },
          cockpit: "write",
          machine,
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

  #mayFollowUp(
    params: Exclude<BotThreadParams, { op: "projects" | "list" | "get" }>,
    reply: {
      note?: boolean;
      aboutThread?: string;
      inspected: ReadonlySet<string>;
      webhook: boolean;
    },
  ) {
    const asked = "only when the person asks you to, in their own message";

    if (params.op === "start" || params.op === "archive") {
      if (params.op === "start" && reply.webhook) return;

      throw new Error(`Start or archive threads ${asked}`);
    }

    if (!reply.note) throw new Error(`Continue or stop a thread ${asked}`);

    if (params.id !== reply.aboutThread) {
      throw new Error(`This note is not about that thread: continue or stop it ${asked}`);
    }

    if (!reply.inspected.has(params.id)) {
      throw new Error(
        "Look at the thread with get_thread first, in this reply: act on where it is now, not on the note",
      );
    }
  }

  async #peersOf(userId: string, selfId: string): Promise<BotPeer[]> {
    const bots = await this.bots.list(userId);
    return bots
      .filter((other) => other.id !== selfId)
      .map(({ handle, name, description }) => ({ handle, name, description }));
  }

  #runtimeOf(bot: Pick<Bot, "runtimeId">) {
    return bot.runtimeId ?? this.defaultRuntimeId;
  }

  #place(runtimeId: string) {
    if (this.agentOnControlPlane && runtimeId !== LOCAL_RUNTIME_ID) {
      const connection = this.hub.get(LOCAL_RUNTIME_ID);

      if (!connection)
        throw new RuntimeOfflineError("The control plane's own runner is not running");

      return { connection, machine: runtimeId };
    }

    const connection = this.hub.get(runtimeId);

    if (!connection) throw new RuntimeOfflineError("The bot's computer is offline");

    return { connection, machine: undefined };
  }

  #cancel(replyId: string, signal: AbortSignal, runtimeId: string) {
    try {
      this.#place(runtimeId).connection.cancelBotReply(replyId, errorOf(signal));
    } catch {}
  }
}

const errorOf = (signal: AbortSignal) =>
  signal.reason instanceof Error ? signal.reason.message : "The reply was cancelled";
