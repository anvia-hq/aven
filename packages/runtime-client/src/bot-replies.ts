import type { AgentPrompt } from "@anvia/core";
import { sentPrompt } from "@aven/agents/attachments";
import { botAgentParts, createBotAgent } from "@aven/agents/bot-agent";
import { keepFiles } from "@aven/agents/bot-files";
import { typingDelay } from "@aven/agents/bot-delay";
import { errorMessage } from "@aven/agents/values";
import { botNote, MAIN_BOT_HANDLE, parseBotPrompt, USER_HANDLE } from "@aven/protocol/bots";
import { SHOW_ARTIFACT_TOOL_NAME } from "@aven/protocol/events";

import { createBotRpcHosts } from "./bots/bot-hosts";
import { rememberBotTurn, remoteBotMemory } from "./bots/remote-bot-memory";
import { keepAttachments } from "./files/attachments";
import { connectMcpForMachine } from "./mcp/machine-mcp";
import { connectMcpServers } from "./mcp/mcp-servers";
import { createHostedRunInput } from "./runs/hosted-input";
import { resolveLens } from "./runner/resolve-lens";
import { boundedTools } from "./tools/late-bound-tools";
import type { ReactToMessage, SendMessage } from "@aven/agents/tools/types";
import type {
  BotReplyInfo,
  CockpitAccess,
  RunEvent,
  RunMemory,
  RunSkill,
  RunWebSearch,
} from "@aven/protocol/types";
import type {
  BotRepliesContext,
  BotReplyMessage,
  ConnectedMcp,
  CreateBotReplyAgent,
  ThreadWorkspaces,
} from "./types";

export const defaultCreateBotAgent =
  (origin: string): CreateBotReplyAgent =>
  ({
    bot,
    model,
    send,
    react,
    onActivity,
    memory,
    computer,
    createBot,
    deleteBot,
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
    api,
    notes,
    cockpit,
    context,
    projects,
    projectFiles,
    lens,
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
      react,
      onActivity,
      memory,
      computer,
      createBot,
      deleteBot,
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
      api,
      notes,
      cockpit,
      context,
      projects,
      projectFiles,
      lens: resolveLens(origin, lens),
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
  "You answered without sending anything: the person sees only what you send with send_message, and nothing of what you wrote outside it. Send your answer now with send_message, split into short bubbles (one thought per call, never one long block), and do not repeat what you did.";

type Reply = { botId: string; abort: AbortController; spoke: boolean; machine?: string };

export class BotReplies {
  #live = new Map<string, Reply>();
  #tasks = new Set<Promise<void>>();
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
    const task = this.#answer(message, abort);
    this.#tasks.add(task);
    void task.finally(() => this.#tasks.delete(task));
  }

  cancel(replyId: string, reason: string) {
    this.#live.get(replyId)?.abort.abort(new Error(reason));
  }

  abortAll(reason: string) {
    for (const reply of this.#live.values()) reply.abort.abort(new Error(reason));
  }

  async close(reason = "The runner is stopping") {
    this.abortAll(reason);
    await Promise.allSettled(this.#tasks);
  }

  async #answer(message: BotReplyMessage, abort: AbortController) {
    const {
      replyId,
      bot,
      prompt,
      attachments,
      skills,
      mcp: servers,
      memory,
      cockpit,
      webSearch,
    } = message;
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
      const parsedPrompt = parseBotPrompt(prompt);
      const agent = await this.#agentFor(
        replyId,
        { message, skills: skills ?? [], memory, cockpit, webSearch, parsedPrompt },
        mcp,
        abort,
      );
      const asked = await this.#promptOf(bot.id, prompt, attachments);
      const session = { sessionId: bot.id };
      await agent.generate({ prompt: asked, session, abortSignal: signal });
      const { from, note } = parsedPrompt;

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
      message,
      skills,
      memory,
      cockpit,
      webSearch,
      parsedPrompt,
    }: {
      message: BotReplyMessage;
      skills: readonly RunSkill[];
      memory?: RunMemory;
      cockpit?: CockpitAccess;
      webSearch?: RunWebSearch;
      parsedPrompt: ReturnType<typeof parseBotPrompt>;
    },
    mcp: ConnectedMcp | undefined,
    abort: AbortController,
  ) {
    const { bot } = message;
    const { boxes, starting, call, send: post, createAgent } = this.#context;
    const sandbox = this.#computer(bot.id);
    await starting(bot.id);
    abort.signal.throwIfAborted();
    const box = await sandbox.acquire({ id: bot.id, bot: true });
    boxes.set(bot.id, box);
    const skillListing = await this.#installSkills(replyId, bot.id, skills);
    const peers = [...bot.peers];
    const { from, note } = parsedPrompt;
    const canAskPerson = !note && (bot.handle === MAIN_BOT_HANDLE || from === undefined);
    const spoke = () => {
      const reply = this.#live.get(replyId);

      if (reply) reply.spoke = true;
    };
    const send: SendMessage = async ({ to, text, quote, files }, { abortSignal }) => {
      if (to !== USER_HANDLE) {
        if (files?.length) throw new Error("Files can only be sent to the person");

        const sent = await call("bot.send", { replyId, to, text });
        spoke();
        return `Sent to ${sent.name} (${sent.handle}).`;
      }

      const shown = files?.length
        ? await keepFiles(
            {
              readFile: (options) => {
                if (!box.runtime) throw new Error("Your computer cannot send files");

                return box.runtime.readFile(options);
              },
              save: (bytes, mediaType) => {
                if (!sandbox.artifacts) throw new Error("This runner keeps no files");

                return sandbox.artifacts.save(bot.id, bytes, mediaType);
              },
            },
            files,
            abortSignal,
          )
        : undefined;

      if (shown && shown.kept.length === 0) throw new Error(shown.failed[0]!.error);

      await this.#pause(typingDelay(text), abortSignal);

      if (post({ type: "bot.say", replyId, text, quote, files: shown?.kept })) {
        spoke();
        return shown
          ? { sent: "Sent to the person.", artifacts: shown.kept, failed: shown.failed }
          : "Sent to the person.";
      }

      const lost = new Error("The connection to the control plane dropped");
      abort.abort(lost);
      throw lost;
    };
    const react: ReactToMessage = async ({ messageId, emoji }) => {
      const reacted = await call("bot.react", { replyId, messageId, emoji });
      spoke();
      return `Reacted to ${reacted.messageId} with ${emoji}.`;
    };
    const computer = boundedTools(
      box.tools.filter((tool) => tool.name !== SHOW_ARTIFACT_TOOL_NAME),
    );
    const exec = computer.find((tool) => tool.name === "exec_command");
    let shown: string | null = null;
    const onActivity = (label: string | null) => {
      if (label === shown) return;

      shown = label;
      post({ type: "bot.activity", replyId, label });
    };
    const rpcHosts = createBotRpcHosts({
      replyId,
      call,
      exec,
      canAskPerson,
      hasProjects: Boolean(message.projects?.length),
      spoke,
    });
    const hosts: BotHosts = {
      bot,
      send,
      react,
      onActivity,
      peers,
      memory: {
        store: remoteBotMemory(replyId, (params) => call("bot.memory", params)),
        savePolicy: "turn",
      },
      computer,
      paths: sandbox.paths?.(bot.id),
      ...rpcHosts,
      askQuestion: note
        ? undefined
        : (questions) => {
            spoke();
            return call("bot.question", { replyId, questions });
          },
      updateSelf: (changes) => call("bot.update", { ...changes, replyId }),
      skills: skillListing,
      mcp: mcp && { tools: boundedTools(mcp.tools), note: mcp.note },
      api: async (params) => call("bot.api", { replyId, ...params }),
      notes: memory && {
        memory,
        host: (command) => call("bot.notes", { replyId, command }),
      },
      cockpit: cockpit && {
        access: cockpit,
        host: (command) => call("bot.cockpit", { replyId, command }),
      },
      context: message.context,
      projects: message.projects,
      webSearch,
      lens: message.lens,
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
      deleteBot: bot.canCreateBots
        ? async (input) => {
            const gone = await call("bot.delete", { ...input, replyId });
            const at = peers.findIndex((peer) => peer.handle === gone.handle);

            if (at >= 0) peers.splice(at, 1);

            return gone;
          }
        : undefined,
    };

    if (!message.backend || message.backend === "native")
      return createAgent({ ...hosts, model: nativeModel(message) });

    return hostedAgent(this.#context, message, hosts, abort, sandbox);
  }
}

type BotHosts = Omit<Parameters<CreateBotReplyAgent>[0], "model">;

type ReplyAgent = {
  generate(input: { prompt: AgentPrompt; abortSignal?: AbortSignal }): Promise<unknown>;
};

function partsOf(bot: BotReplyInfo, hosts: BotHosts) {
  return botAgentParts({
    ...hosts,
    name: bot.name,
    handle: bot.handle,
    instruction: bot.instruction,
    description: bot.description,
  });
}

function activityOf(event: RunEvent) {
  if (event.type === "tool_start") return event.tool.name;

  if (event.type === "text" || event.type === "reasoning") return null;

  return undefined;
}

function hostedAgent(
  context: BotRepliesContext,
  message: BotReplyMessage,
  hosts: BotHosts,
  abort: AbortController,
  computer: ThreadWorkspaces,
): ReplyAgent {
  const backend = message.backend;

  if (!backend || backend === "native") throw new Error("This bot does not run on another agent");

  if (!context.backends) throw new Error(`This runner cannot drive the ${backend} agent for a bot`);

  const { bot, claudeToken, claudeModel, claudeEffort, codexToken, codexModel, codexEffort } =
    message;
  const parts = partsOf(bot, hosts);
  const runOf = (suffix: string) => `${message.replyId}-${bot.id}${suffix}`;
  const remember = rememberBotTurn(message.replyId, (params) => context.call("bot.memory", params));
  let turns = 0;

  return {
    async generate({ prompt, abortSignal }) {
      const signal = abortSignal ?? abort.signal;
      signal.throwIfAborted();
      const agent = await context.backends!.get(backend);
      signal.throwIfAborted();
      const cwd =
        (await computer.workspace?.(bot.id).catch(() => undefined)) ??
        computer.paths?.(bot.id)?.workspace ??
        process.cwd();
      const input = createHostedRunInput(backend, {
        token: backend === "claude" ? claudeToken : codexToken,
        workspace: () => Promise.resolve(cwd),
        caller: context,
        instructions: parts.instructions,
        model: backend === "claude" ? claudeModel : codexModel,
        effort: backend === "claude" ? claudeEffort : codexEffort,
        questions: false,
        tools: { catalog: parts.tools, questions: false },
      });
      const followed = await agent.start(
        runOf(turns++ === 0 ? "" : `-${turns}`),
        bot.id,
        prompt,
        input,
        (event) => {
          const label = activityOf(event);

          if (label !== undefined) hosts.onActivity?.(label);
        },
      );
      const stop = () => void followed.cancel();
      signal.addEventListener("abort", stop, { once: true });

      if (signal.aborted) stop();

      try {
        const end = await followed.done;

        if (end.type === "error") {
          await agent
            .unfinishedMessages(followed.durableId)
            .then((messages) => remember(followed.durableId, messages))
            .catch(() => undefined);
          throw new Error(end.error);
        }

        if (end.type === "interaction")
          throw new Error("This bot cannot park on a question from its agent");

        await remember(followed.durableId, end.messages);
      } finally {
        signal.removeEventListener("abort", stop);
      }
    },
  };
}

function nativeModel(message: BotReplyMessage) {
  if (!message.model) throw new Error("The control plane sent no model for this bot");

  return message.model;
}
