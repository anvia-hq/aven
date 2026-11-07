import type { Agent, AgentMemoryOptions, AgentPrompt, AnyTool } from "@anvia/core";
import { sentPrompt } from "@aven/agents/attachments";
import { createBotAgent } from "@aven/agents/bot-agent";
import { typingDelay } from "@aven/agents/bot-delay";
import { errorMessage } from "@aven/agents/values";
import type { AskQuestion } from "@aven/agents/tools/ask-question";
import type { CreateBot } from "@aven/agents/tools/create-bot";
import type { UpdateSelf } from "@aven/agents/tools/update-self";
import type { GoalHost } from "@aven/agents/tools/goals";
import type { McpNote } from "@aven/agents/mcp";
import type { McpServersHost } from "@aven/agents/tools/mcp-servers";
import type { CockpitHost } from "@aven/agents/tools/cockpit";
import type { MemoryHost } from "@aven/agents/tools/memory";
import type { ProvidersHost } from "@aven/agents/tools/providers";
import type { ScheduleHost } from "@aven/agents/tools/schedules";
import type { ThreadsHost } from "@aven/agents/tools/threads";
import type { SendMessage } from "@aven/agents/tools/send-message";
import { botNote, MAIN_BOT_HANDLE, parseBotPrompt, USER_HANDLE } from "@aven/protocol/bots";
import type { BotGoalView } from "@aven/protocol/goals";
import type { BotMcpView } from "@aven/protocol/mcp";
import type { CockpitAccess } from "@aven/protocol/cockpit";
import type { RunMemory } from "@aven/protocol/memory";
import type { BotProviderView, ProviderKeyAsk } from "@aven/protocol/providers";
import type { BotScheduleView } from "@aven/protocol/schedules";
import type { BotProjectView, BotThreadDetail, BotThreadView } from "@aven/protocol/threads";
import { SHOW_ARTIFACT_TOOL_NAME } from "@aven/protocol/events";
import type {
  BotPeer,
  BotReplyInfo,
  ControlPlaneToRuntime,
  RunModel,
  RunSkill,
  RuntimeCalls,
  RuntimeToControlPlane,
} from "@aven/protocol/runtime-wire";

import type { SkillListing } from "@aven/agents/skills";

import { keepAttachments } from "./attachments";
import { verifyWith } from "./goal-assessment";
import { boundedTools } from "./late-bound-tools";
import { connectMcpServers, type ConnectedMcp } from "./mcp-servers";
import { remoteBotMemory } from "./remote-bot-memory";
import type { ThreadSandbox, ThreadWorkspaces } from "./sandbox";

export type BotReplyMessage = Extract<ControlPlaneToRuntime, { type: "bot.reply" }>;

/** Makes the agent of one reply. Tests make theirs with a scripted model. */
export type CreateBotReplyAgent = (input: {
  bot: BotReplyInfo;
  model: RunModel;
  send: SendMessage;
  memory: AgentMemoryOptions;
  /** What the bot can do on its computer. */
  computer: readonly AnyTool[];
  /** Makes another bot; only for the person's main bot (decision 0060). */
  createBot?: CreateBot;
  /** Asks the person to decide; not given when the reply answers a note, since nobody is there (decision 0066). */
  askQuestion?: AskQuestion;
  /** The bot's goal, which it works on in rounds the control plane wakes it for (decision 0068). */
  goals: GoalHost;
  /** The person's schedules, which the bot may look at and, on their word, change (decision 0067). */
  schedules: ScheduleHost;
  /** The bots this one may write to: the reply's own list, to which a bot it makes is added (decision 0065). */
  peers: BotPeer[];
  /** Changes the bot's own name, description or instruction (decision 0061). */
  updateSelf: UpdateSelf;
  /** The skills in the bot's `/skills` for this reply (decision 0081). */
  skills: readonly SkillListing[];
  /** The tools of the person's MCP servers this reply connected, and what the bot is told of them (decision 0085). */
  mcp?: { tools: readonly AnyTool[]; note: McpNote };
  /** Keeps the person's MCP servers, on their word (decision 0085). */
  mcpServers: McpServersHost;
  /** Keeps the person's model providers, on their word, and asks for a key when someone is there to type it (decision 0086). */
  providers: ProvidersHost;
  /** Looks at the person's threads and, on their word, works them (decision 0088). */
  threads: ThreadsHost;
  /** The bot's notes and its person's, when the reply has them (decision 0102). */
  notes?: { memory: RunMemory; host: MemoryHost };
  /** The person's cockpit, when the reply may work it (decision 0109). */
  cockpit?: { access: CockpitAccess; host: CockpitHost };
}) => Pick<Agent<unknown>, "generate">;

// Builds the agent as a run's is: the model is reached through the control plane's gateway with the
// reply's token, so this process holds no provider key.
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

// What makes a message "typed": the wait before it is sent, which a cancel cuts short.
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

export type BotRepliesContext = {
  sandbox: ThreadWorkspaces;
  createAgent: CreateBotReplyAgent;
  /** False when the link is down and the message went nowhere. */
  send(message: RuntimeToControlPlane): boolean;
  call<M extends keyof RuntimeCalls>(
    method: M,
    params: RuntimeCalls[M]["params"],
  ): Promise<RuntimeCalls[M]["result"]>;
  /** The sandboxes of the threads and bots that have one. */
  boxes: Map<string, ThreadSandbox>;
  /** A reply is about to use the bot's sandbox: it must not be released as idle. */
  starting(botId: string): Promise<void>;
  /** A reply is over: the bot's sandbox may be released once it has been idle for a while. */
  finished(botId: string): void;
  pause?: (ms: number, signal?: AbortSignal) => Promise<void>;
};

// What a bot is told when it answered a person without sending anything (decision 0125).
const UNSENT_NOTE =
  "You answered without sending anything: the person sees only what you send with send_message, and nothing of what you wrote outside it. Send your answer now with send_message, the way you would text it, and do not repeat what you did.";

// `spoke`: the bot has said something in this reply: sent a message, or asked the person.
type Reply = { botId: string; abort: AbortController; spoke: boolean };

// Answers for the bots of the control plane (decision 0059): the bot's agent runs here, on the
// bot's own computer, and what it says goes back one message at a time. The conversation is the
// control plane's, read and written through `bot.memory`. A reply that loses its connection is not
// taken up again: the control plane ends it, and the person says it again.
export class BotReplies {
  #live = new Map<string, Reply>();
  #context: BotRepliesContext;
  #pause: NonNullable<BotRepliesContext["pause"]>;

  constructor(context: BotRepliesContext) {
    this.#context = context;
    this.#pause = context.pause ?? sleep;
  }

  /** Whether the bot is answering now. */
  has(botId: string) {
    return [...this.#live.values()].some((reply) => reply.botId === botId);
  }

  start(message: BotReplyMessage) {
    const abort = new AbortController();
    this.#live.set(message.replyId, { botId: message.bot.id, abort, spoke: false });
    void this.#answer(message, abort);
  }

  cancel(replyId: string, reason: string) {
    this.#live.get(replyId)?.abort.abort(new Error(reason));
  }

  abortAll(reason: string) {
    for (const reply of this.#live.values()) reply.abort.abort(new Error(reason));
  }

  // One reply, which never throws: how it ended is told to the control plane.
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
      mcp = await this.#connectMcp(replyId, servers);
      const agent = await this.#agentFor(
        replyId,
        { bot, prompt, model, skills: skills ?? [], memory, cockpit },
        mcp,
        abort,
      );
      const asked = await this.#promptOf(bot.id, prompt, attachments);
      const session = { sessionId: bot.id };
      await agent.generate({ prompt: asked, session, abortSignal: signal });
      // The person sees only what the bot sends with `send_message`. A bot that answers a person in
      // plain text instead, as some models do, would be met with silence: it is told once to send it.
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

  // Connects the person's MCP servers for bots and tells the control plane how each went, for Settings
  // (decision 0085). A server that is down is left out, and does not fail the reply.
  async #connectMcp(replyId: string, servers: BotReplyMessage["mcp"]) {
    if (!servers?.length) return undefined;
    const connected = await connectMcpServers(servers);
    this.#context
      .call("bot.mcp", { replyId, op: "report", results: connected.results })
      .catch((error: unknown) => {
        console.warn(`Reply ${replyId} could not report on its MCP servers:`, errorMessage(error));
      });
    return connected;
  }

  // What the bot is asked: the text alone, or, with files the person sent (decision 0080), the text,
  // where they are in the bot's /uploads and the images themselves, as a thread's agent is asked.
  async #promptOf(
    botId: string,
    prompt: string,
    attachments: BotReplyMessage["attachments"],
  ): Promise<AgentPrompt> {
    if (!attachments?.length) return prompt;
    const kept = await keepAttachments(this.#context.sandbox, botId, attachments);
    const images = new Map(
      attachments.flatMap(({ image, data }) => (image ? [[image, data] as const] : [])),
    );
    return sentPrompt(prompt, { attachments: kept, images });
  }

  // Puts the reply's skills in the bot's /skills, as a thread's run does (decision 0081); a runner
  // with no store for them, or a skill that cannot be had, leaves them out and the reply goes on.
  async #installSkills(replyId: string, botId: string, skills: readonly RunSkill[]) {
    const store = this.#context.sandbox.skills;
    if (!store) return [];
    const fetch = async (digest: string) =>
      Uint8Array.fromBase64((await this.#context.call("bot.skill", { replyId, digest })).data);
    return store.install(botId, skills, fetch);
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
    const { sandbox, boxes, starting, call, send: post, createAgent } = this.#context;
    await starting(bot.id);
    abort.signal.throwIfAborted();
    const box = await sandbox.acquire({ id: bot.id });
    boxes.set(bot.id, box);
    const skillListing = await this.#installSkills(replyId, bot.id, skills);
    // What a bot sends the person is shown as typed; what it sends another bot goes at once, and
    // the other bot's answer is a message of its own (decision 0065).
    const peers = [...bot.peers];
    // Someone is there to type a key in the person's chat: not for a note, and not for a bot that
    // is answering another bot, which has no chat with the person in front of it (decision 0086).
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
      // A tool's error goes back to the model, which could try again; the reply is over instead.
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
      goals: {
        get: async () => (await call("bot.goal", { replyId, op: "get" })) as BotGoalView | null,
        start: async (input) =>
          (await call("bot.goal", { replyId, op: "start", ...input })) as BotGoalView,
        update: async (action, reason) =>
          (await call("bot.goal", { replyId, op: "update", action, reason })) as BotGoalView | null,
        // The goal's checks, one after another on the bot's computer; what did not pass is told.
        check: async (checks, signal) => {
          const failed: string[] = [];
          for (const check of checks) {
            // A cancelled reply stops checking, so no command goes on after it.
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
      // A note wakes the bot with no one to answer; the control plane holds to that as well.
      askQuestion: parseBotPrompt(prompt).note
        ? undefined
        : (questions) => {
            spoke();
            return call("bot.question", { replyId, questions });
          },
      updateSelf: (changes) => call("bot.update", { ...changes, replyId }),
      skills: skillListing,
      // The servers' tools are kept small as the computer's are, since the chat keeps what they return.
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
        // The control plane holds to who may be asked, as for a question: not a note, and not a bot
        // that is answering another bot.
        askKey: canAskPerson
          ? async (id) => {
              spoke();
              return (await call("bot.provider", { replyId, op: "askKey", id })) as ProviderKeyAsk;
            }
          : undefined,
      },
      // What each call may do is the control plane's to say, and it holds to it whatever is asked here.
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
      // Whether the reply may change them is the control plane's to say, and it holds to it.
      notes: memory && {
        memory,
        host: (command) => call("bot.notes", { replyId, command }),
      },
      // What the bot may do there is the control plane's to say, and it holds to it (decision 0109).
      cockpit: cockpit && {
        access: cockpit,
        host: (command) => call("bot.cockpit", { replyId, command }),
      },
      // The control plane says whether this bot may, and holds to it whatever is asked here.
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
