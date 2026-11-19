import type { MemoryStore } from "@anvia/core";
import { BOT_MESSAGE_MAX, BOT_MESSAGES_PER_REPLY, parseBotPrompt } from "@aven/protocol/bots";
import { isGoalRoundNote } from "@aven/protocol/goals";
import type { RunGateway } from "../runtimes/gateway";
import { RuntimeOfflineError, type RuntimeHub } from "../runtimes/hub";
import { LOCAL_RUNTIME_ID } from "../runtimes/service";
import { answerBotMemory } from "./memory-answer";
import { replyHosts } from "./reply-hosts";
import { TalkBotReplier } from "./talk-replier";
import { lensSettingsService } from "../lens/service";
import { webSearchForRun } from "../runs/web-search";
import type {
  BotKeeper,
  BotMemoryNotes,
  BotReplier,
  BotReplyInput,
  BotSkills,
  BotWorldKeeper,
  NewBot,
} from "./types";
import type { BotMcp } from "../mcp/types";
import type { BotProviders, BotRunChoice } from "../providers/types";
import type { BotThreads } from "../threads/types";
import { describeError, UnavailableError } from "@aven/server-kit/errors";
import type {
  AgentBackendKind,
  Bot,
  BotGoaled,
  BotGoalParams,
  BotMcped,
  BotMcpParams,
  BotNotesParams,
  BotPeer,
  BotProjected,
  BotProjectParams,
  BotProvided,
  BotProviderParams,
  BotQuestioned,
  BotQuestionParams,
  RunModel,
  BotReactParams,
  BotScheduled,
  BotScheduleParams,
  BotDeleted,
  BotDeleteParams,
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

function backendName(backend: AgentBackendKind) {
  return backend === "claude" ? "the Claude agent" : "the Codex agent";
}

function credentialOf(choice: BotRunChoice, model: RunModel | undefined) {
  if (choice.backend === "claude")
    return {
      backend: choice.backend,
      claudeToken: choice.token,
      claudeModel: choice.modelId,
      claudeEffort: choice.effort,
    };

  if (choice.backend === "codex")
    return {
      backend: choice.backend,
      codexToken: choice.token,
      codexModel: choice.modelId,
      codexEffort: choice.effort,
    };

  return { model };
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
    private world: BotWorldKeeper,
    private agentOnControlPlane = true,
    private talk = new TalkBotReplier({ store, bots, world, mcp, providers, threads, notes }),
  ) {}

  ready(choice: BotRunChoice, bot: Pick<Bot, "runtimeId" | "hasComputer">) {
    if (!bot.hasComputer) return this.talk.ready(choice, bot);

    const { connection } = this.#place(this.#runtimeOf(bot));

    if (choice.backend !== "native" && !connection.offers(choice.backend))
      throw new UnavailableError(
        `The computer this bot runs on does not drive ${backendName(choice.backend)}: update its runner`,
      );

    if (choice.model) this.gateway.check(choice.model);
  }

  async answer(input: BotReplyInput) {
    const {
      bot,
      userId,
      choice,
      prompt,
      attachments,
      hops,
      onPersonsWord,
      aboutThread,
      say,
      ask,
      react,
      activity,
      signal,
    } = input;
    signal.throwIfAborted();

    if (!bot.hasComputer) return this.talk.answer(input);

    if (isGoalRoundNote(prompt) && (await this.bots.goals.get(bot.id))?.phase !== "active") return;

    if (bot.runtimeId) await this.bots.usableRuntime(userId, bot.runtimeId);

    const peers = await this.#peersOf(userId, bot.id);
    const timezone = await this.bots.timezone(userId);
    const skills = await this.skills.forRun(userId);
    const mcpServers = await this.mcp.forRun(userId);
    const givenMcp = new Set(mcpServers.map((server) => server.id));
    const world = await this.world.forReply(userId);
    const memoryOwner = {
      userId,
      botId: bot.id,
      readProjects: world.projects.map(({ id, slug }) => ({ id, slug })),
    };
    const keepsNotes = onPersonsWord;
    await this.notes
      .keepDigest(userId, bot.id)
      .catch((error: unknown) =>
        console.warn(`Could not keep the activity digest of bot ${bot.id}:`, describeError(error)),
      );
    const folders = await this.notes.folders(memoryOwner);
    signal.throwIfAborted();
    const runtimeId = this.#runtimeOf(bot);
    const { connection, machine } = this.#place(runtimeId);
    const replyId = crypto.randomUUID();
    const runModel = choice.model ? this.gateway.issue(replyId, choice.model) : undefined;
    const ended = Promise.withResolvers<void>();
    const { from, note } = parseBotPrompt(prompt);
    const makesBotsOnTheirWord = onPersonsWord && from === undefined;
    const hosts = replyHosts({
      bot,
      userId,
      prompt,
      hops,
      onPersonsWord,
      aboutThread,
      memoryOwner,
      ask,
      bots: this.bots,
      mcp: this.mcp,
      providers: this.providers,
      threads: this.threads,
      notes: this.notes,
      world: this.world,
    });
    let written = 0;
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
      activity: (label: string | null) => activity?.(label),
      end: (error?: string) => (error ? ended.reject(new Error(error)) : ended.resolve()),
      lost: (error: Error) => ended.reject(error),
      react: async ({ messageId, emoji }: Omit<BotReactParams, "replyId">) =>
        react(messageId, emoji),
      memory: answerBotMemory(this.store, { sessionId: bot.id, userId }),
      create: async ({ name, instruction, description }: NewBot) =>
        hosts.createBot({ name, instruction, description }),
      delete: async ({ handle }: Omit<BotDeleteParams, "replyId">): Promise<BotDeleted> =>
        hosts.deleteBot({ handle }),
      send: ({ to, text }: Omit<BotSendParams, "replyId">) => sendToBot(to, text),
      question: async ({
        questions,
      }: Omit<BotQuestionParams, "replyId">): Promise<BotQuestioned> => {
        if (note) throw new Error("Nobody is there to answer: this was not the person's message");

        if (hosts.asked())
          throw new Error("You have already asked. Stop now and wait for the answer.");

        hosts.takeAsked();

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
        if (params.op === "list") return hosts.schedules.list();

        if (params.op === "delete") {
          await hosts.schedules.remove(params.id);
          return null;
        }

        if (params.op === "update") {
          const { name, cron, prompt: task, timezone, enabled, bot: target } = params;

          return hosts.schedules.update(params.id, {
            name,
            cron,
            prompt: task,
            timezone,
            enabled,
            bot: target,
          });
        }

        const { name, cron, prompt: task, timezone, bot: target } = params;
        return hosts.schedules.create({ name, cron, prompt: task, timezone, bot: target });
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

        if (params.op === "remove") {
          await hosts.mcpServers.remove(params.id);
          return null;
        }

        if (params.op === "update") {
          const { name, url, headers, target, enabled } = params;

          return hosts.mcpServers.update(params.id, { name, url, headers, target, enabled });
        }

        const { name, url, headers, target } = params;
        return hosts.mcpServers.add({ name, url, headers, target });
      },
      provider: async (params: BotProviderParams): Promise<BotProvided> => {
        if (params.op === "list") return hosts.providers.list();

        if (params.op === "models") return { models: await hosts.providers.models(params.id) };

        if (params.op === "askKey") {
          if (!hosts.providers.askKey) throw new Error("Nobody is there to type a key");

          return hosts.providers.askKey(params.id);
        }

        if (params.op === "remove") {
          await hosts.providers.remove(params.id);
          return null;
        }

        if (params.op === "update") {
          const { name, baseUrl, modelId, isDefault } = params;

          return hosts.providers.update(params.id, { name, baseUrl, modelId, isDefault });
        }

        const { kind, name, baseUrl, modelId, isDefault } = params;
        return hosts.providers.add({ kind, name, baseUrl, modelId, isDefault });
      },
      api: async (params: BotApiParams): Promise<BotApiResult> => hosts.api(params),
      thread: async (params: BotThreadParams): Promise<BotThreaded> => {
        if (params.op === "projects") return hosts.threads.projects();

        if (params.op === "list")
          return hosts.threads.list({
            projectId: params.projectId,
            archived: params.archived,
          });

        if (params.op === "get") return hosts.threads.get(params.id);

        if (params.op === "archive")
          return hosts.threads.archive(params.id, params.archived ?? true);

        if (params.op === "stop") return hosts.threads.stop(params.id);

        const { prompt, providerId, modelId, reasoningEffort } = params;
        const choice = { prompt, providerId, modelId, reasoningEffort };

        if (params.op === "continue") return hosts.threads.continue(params.id, choice);

        return hosts.threads.start({
          ...choice,
          projectId: params.projectId,
          title: params.title,
        });
      },
      update: async ({ name, description, instruction }: Omit<BotUpdateParams, "replyId">) =>
        hosts.updateSelf({ name, description, instruction }),
      project: async (params: BotProjectParams): Promise<BotProjected> =>
        params.op === "folder"
          ? { entries: await hosts.projectFiles.folder(params.projectId, params.path) }
          : hosts.projectFiles.file(params.projectId, params.path),
      notes: ({ command }: Omit<BotNotesParams, "replyId">) => hosts.notes(command),
      cockpit: ({ command }: { command: unknown }) => hosts.cockpit(command),
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
          ...credentialOf(choice, runModel),
          attachments: attachments?.length ? attachments : undefined,
          skills: skills.length ? skills : undefined,
          mcp: mcpServers.length ? mcpServers : undefined,
          memory: { folders, writable: keepsNotes },
          cockpit: "write",
          context: world.context,
          projects: world.projects.length ? world.projects : undefined,
          webSearch: webSearchForRun,
          lens: choice.backend === "native" ? await lensSettingsService.forRun() : undefined,
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

  async #peersOf(userId: string, selfId: string): Promise<BotPeer[]> {
    const bots = await this.bots.list(userId);
    return bots.flatMap(({ id, handle, name, description }) =>
      id === selfId ? [] : [{ handle, name, description }],
    );
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
