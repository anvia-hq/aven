import type { AgentPrompt } from "@anvia/core";
import { sentPrompt } from "@aven/agents/attachments";
import { createBotAgent } from "@aven/agents/bot-agent";
import { typingDelay } from "@aven/agents/bot-delay";
import { errorMessage } from "@aven/agents/values";
import { botNote, MAIN_BOT_HANDLE, parseBotPrompt, USER_HANDLE } from "@aven/protocol/bots";
import { SHOW_ARTIFACT_TOOL_NAME } from "@aven/protocol/events";

import { keepAttachments } from "./attachments";
import { verifyWith } from "./goal-assessment";
import { boundedTools } from "./late-bound-tools";
import { connectMcpServers } from "./mcp-servers";
import { connectMcpForMachine } from "./machine-mcp";
import { remoteBotMemory } from "./remote-bot-memory";
import type { SendMessage } from "@aven/agents/tools/types";
import type {
  BotGoalView,
  BotMcpView,
  BotProjectView,
  BotProviderView,
  BotReplyInfo,
  BotScheduleView,
  BotThreadDetail,
  BotThreadView,
  CockpitAccess,
  ProviderKeyAsk,
  RunMemory,
  RunModel,
  RunSkill,
} from "@aven/protocol/types";
import type {
  BotRepliesContext,
  BotReplyMessage,
  ConnectedMcp,
  CreateBotReplyAgent,
} from "./types";

export const defaultCreateBotAgent =
  (origin: string): CreateBotReplyAgent =>
  ({
    bot,
    model,
    send,
    memory,
    computer,
    createBot,
    askQuestion,
    goals,
    schedules,
    peers,
    updateSelf,
    skills,
    mcp,
    mcpServers,
    providers,
    threads,
    notes,
    cockpit,
  }) =>
    createBotAgent({
      provider: model.provider,
      modelId: model.modelId,
      apiKey: model.gatewayToken,
      baseUrl: `${origin}${model.gatewayPath}`,
      reasoningEffort: model.reasoningEffort,
      effortLevels: model.effortLevels,
      contextWindow: model.contextWindow,
      id: bot.id,
      name: bot.name,
      handle: bot.handle,
      instruction: bot.instruction,
      compactAfterTokens: bot.compactAfterTokens,
      send,
      memory,
      computer,
      createBot,
      askQuestion,
      goals,
      schedules,
      timezone: bot.timezone,
      peers,
      description: bot.description,
      updateSelf,
      skills,
      mcp,
      mcpServers,
      providers,
      threads,
      notes,
      cockpit,
    });

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

const UNSENT_NOTE =
  "You answered without sending anything: the person sees only what you send with send_message, and nothing of what you wrote outside it. Send your answer now with send_message, the way you would text it, and do not repeat what you did.";

type Reply = { botId: string; abort: AbortController; spoke: boolean; machine?: string };

export class BotReplies {
  #live = new Map<string, Reply>();
  #context: BotRepliesContext;
  #pause: NonNullable<BotRepliesContext["pause"]>;

  constructor(context: BotRepliesContext) {
    this.#context = context;
    this.#pause = context.pause ?? sleep;
  }

  get count() {
    return this.#live.size;
  }

  has(botId: string) {
    return [...this.#live.values()].some((reply) => reply.botId === botId);
  }

  replyOnMachine(botId: string) {
    for (const [replyId, reply] of this.#live) {
      if (reply.botId === botId && reply.machine) return replyId;
    }
    return undefined;
  }

  start(message: BotReplyMessage) {
    const abort = new AbortController();
    this.#live.set(message.replyId, {
      botId: message.bot.id,
      abort,
      spoke: false,
      machine: message.machine || undefined,
    });
    void this.#answer(message, abort);
  }

  cancel(replyId: string, reason: string) {
    this.#live.get(replyId)?.abort.abort(new Error(reason));
  }

  abortAll(reason: string) {
    for (const reply of this.#live.values()) reply.abort.abort(new Error(reason));
  }

  async #answer(
    {
      replyId,
      bot,
      prompt,
      model,
      attachments,
      skills,
      mcp: servers,
      memory,
      cockpit,
    }: BotReplyMessage,
    abort: AbortController,
  ) {
    const { send } = this.#context;
    const { signal } = abort;
    let mcp: ConnectedMcp | undefined;
    try {
      mcp = await this.#connectMcp(
        replyId,
        bot.id,
        servers,
        Boolean(this.#live.get(replyId)?.machine),
      );
      const agent = await this.#agentFor(
        replyId,
        { bot, prompt, model, skills: skills ?? [], memory, cockpit },
        mcp,
        abort,
      );
      const asked = await this.#promptOf(bot.id, prompt, attachments);
      const session = { sessionId: bot.id };
      await agent.generate({ prompt: asked, session, abortSignal: signal });
      const { from, note } = parseBotPrompt(prompt);
      if (!this.#live.get(replyId)?.spoke && !note && from === undefined) {
        await agent.generate({ prompt: botNote(UNSENT_NOTE), session, abortSignal: signal });
      }
      send({ type: "bot.end", replyId });
    } catch (error) {
      send({ type: "bot.end", replyId, error: errorMessage(signal.reason ?? error) });
    } finally {
      await mcp?.close();
      this.#live.delete(replyId);
      this.#context.finished(bot.id);
    }
  }

  #computer(botId: string) {
    if (!this.replyOnMachine(botId)) return this.#context.sandbox;
    const { machines } = this.#context;
    if (!machines) throw new Error("This runner cannot reach another computer");
    return machines;
  }

  async #connectMcp(
    replyId: string,
    botId: string,
    servers: BotReplyMessage["mcp"],
    onMachine: boolean,
  ) {
    if (!servers?.length) return undefined;
    const connected = onMachine
      ? await connectMcpForMachine(servers, this.#context.machineCall?.(botId))
      : await connectMcpServers(servers);
    this.#context
      .call("bot.mcp", { replyId, op: "report", results: connected.results })
      .catch((error: unknown) => {
        console.warn(`Reply ${replyId} could not report on its MCP servers:`, errorMessage(error));
      });
    return connected;
  }

  async #promptOf(
    botId: string,
    prompt: string,
    attachments: BotReplyMessage["attachments"],
  ): Promise<AgentPrompt> {
    if (!attachments?.length) return prompt;
    const kept = await keepAttachments(this.#computer(botId), botId, attachments);
    const images = new Map(
      attachments.flatMap(({ image, data }) => (image ? [[image, data] as const] : [])),
    );
    return sentPrompt(prompt, {
      attachments: kept,
      images,
      paths: this.#computer(botId).paths?.(botId),
    });
  }

  async #installSkills(replyId: string, botId: string, skills: readonly RunSkill[]) {
    const store = this.#computer(botId).skills;
    if (!store) return [];
    const fetch = async (digest: string) =>
      Uint8Array.fromBase64((await this.#context.call("bot.skill", { replyId, digest })).data);
    try {
      return await store.install(botId, skills, fetch);
    } catch (error) {
      if (!this.replyOnMachine(botId)) throw error;
      console.warn(`No skills for ${botId}, its computer is unreachable:`, errorMessage(error));
      return [];
    }
  }

  async #agentFor(
    replyId: string,
    {
      bot,
      prompt,
      model,
      skills,
      memory,
      cockpit,
    }: {
      bot: BotReplyInfo;
      prompt: string;
      model: RunModel;
      skills: readonly RunSkill[];
      memory?: RunMemory;
      cockpit?: CockpitAccess;
    },
    mcp: ConnectedMcp | undefined,
    abort: AbortController,
  ) {
    const { boxes, starting, call, send: post, createAgent } = this.#context;
    const sandbox = this.#computer(bot.id);
    await starting(bot.id);
    abort.signal.throwIfAborted();
    const box = await sandbox.acquire({ id: bot.id, bot: true });
    boxes.set(bot.id, box);
    const skillListing = await this.#installSkills(replyId, bot.id, skills);
    const peers = [...bot.peers];
    const { from, note } = parseBotPrompt(prompt);
    const canAskPerson = !note && (bot.handle === MAIN_BOT_HANDLE || from === undefined);
    const spoke = () => {
      const reply = this.#live.get(replyId);
      if (reply) reply.spoke = true;
    };
    const send: SendMessage = async ({ to, text }, { abortSignal }) => {
      if (to !== USER_HANDLE) {
        const sent = await call("bot.send", { replyId, to, text });
        spoke();
        return `Sent to ${sent.name} (${sent.handle}).`;
      }
      await this.#pause(typingDelay(text), abortSignal);
      if (post({ type: "bot.say", replyId, text })) {
        spoke();
        return "Sent to the person.";
      }
      const lost = new Error("The connection to the control plane dropped");
      abort.abort(lost);
      throw lost;
    };
    const computer = boundedTools(
      box.tools.filter((tool) => tool.name !== SHOW_ARTIFACT_TOOL_NAME),
    );
    const exec = computer.find((tool) => tool.name === "exec_command");
    return createAgent({
      bot,
      model,
      send,
      peers,
      memory: {
        store: remoteBotMemory(replyId, (params) => call("bot.memory", params)),
        savePolicy: "turn",
      },
      computer,
      paths: sandbox.paths?.(bot.id),
      goals: {
        get: async () => (await call("bot.goal", { replyId, op: "get" })) as BotGoalView | null,
        start: async (input) =>
          (await call("bot.goal", { replyId, op: "start", ...input })) as BotGoalView,
        update: async (action, reason) =>
          (await call("bot.goal", { replyId, op: "update", action, reason })) as BotGoalView | null,
        check: async (checks, signal) => {
          const failed: string[] = [];
          for (const check of checks) {
            signal?.throwIfAborted();
            const [result] = await verifyWith(exec, [check])();
            if (result && result.exitCode !== 0) {
              const how = result.exitCode === null ? "timed out" : `exited ${result.exitCode}`;
              failed.push(`$ ${result.command}\n(${how})\n${result.output}`.trimEnd());
            }
          }
          return failed;
        },
      },
      schedules: {
        list: async () =>
          (await call("bot.schedule", { replyId, op: "list" })) as BotScheduleView[],
        create: async (input) =>
          (await call("bot.schedule", { replyId, op: "create", ...input })) as BotScheduleView,
        update: async (id, patch) =>
          (await call("bot.schedule", { replyId, op: "update", id, ...patch })) as BotScheduleView,
        remove: async (id) => void (await call("bot.schedule", { replyId, op: "delete", id })),
      },
      askQuestion: parseBotPrompt(prompt).note
        ? undefined
        : (questions) => {
            spoke();
            return call("bot.question", { replyId, questions });
          },
      updateSelf: (changes) => call("bot.update", { ...changes, replyId }),
      skills: skillListing,
      mcp: mcp && { tools: boundedTools(mcp.tools), note: mcp.note },
      mcpServers: {
        list: async () => (await call("bot.mcp", { replyId, op: "list" })) as BotMcpView[],
        add: async (input) =>
          (await call("bot.mcp", { replyId, op: "add", ...input })) as BotMcpView,
        update: async (id, patch) =>
          (await call("bot.mcp", { replyId, op: "update", id, ...patch })) as BotMcpView,
        remove: async (id) => void (await call("bot.mcp", { replyId, op: "remove", id })),
      },
      providers: {
        list: async () =>
          (await call("bot.provider", { replyId, op: "list" })) as BotProviderView[],
        add: async (input) =>
          (await call("bot.provider", { replyId, op: "add", ...input })) as BotProviderView,
        update: async (id, patch) =>
          (await call("bot.provider", { replyId, op: "update", id, ...patch })) as BotProviderView,
        remove: async (id) => void (await call("bot.provider", { replyId, op: "remove", id })),
        models: async (id) =>
          ((await call("bot.provider", { replyId, op: "models", id })) as { models: string[] })
            .models,
        askKey: canAskPerson
          ? async (id) => {
              spoke();
              return (await call("bot.provider", { replyId, op: "askKey", id })) as ProviderKeyAsk;
            }
          : undefined,
      },
      threads: {
        projects: async () =>
          (await call("bot.thread", { replyId, op: "projects" })) as BotProjectView[],
        list: async (filter) =>
          (await call("bot.thread", { replyId, op: "list", ...filter })) as BotThreadView[],
        get: async (id) =>
          (await call("bot.thread", { replyId, op: "get", id })) as BotThreadDetail,
        start: async (input) =>
          (await call("bot.thread", { replyId, op: "start", ...input })) as BotThreadView,
        continue: async (id, input) =>
          (await call("bot.thread", { replyId, op: "continue", id, ...input })) as BotThreadView,
        archive: async (id, archived) =>
          (await call("bot.thread", { replyId, op: "archive", id, archived })) as BotThreadView,
        stop: async (id) =>
          (await call("bot.thread", { replyId, op: "stop", id })) as BotThreadView,
      },
      notes: memory && {
        memory,
        host: (command) => call("bot.notes", { replyId, command }),
      },
      cockpit: cockpit && {
        access: cockpit,
        host: (command) => call("bot.cockpit", { replyId, command }),
      },
      createBot: bot.canCreateBots
        ? async (input) => {
            const made = await call("bot.create", { ...input, replyId });
            peers.push({
              handle: made.handle,
              name: made.name,
              description: input.description ?? "",
            });
            return made;
          }
        : undefined,
    });
  }
}
