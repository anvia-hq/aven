import type { Agent, AgentMemoryOptions, AnyTool } from "@anvia/core";
import { createBotAgent } from "@aven/agents/bot-agent";
import { typingDelay } from "@aven/agents/bot-delay";
import { errorMessage } from "@aven/agents/values";
import type { AskQuestion } from "@aven/agents/tools/ask-question";
import type { CreateBot } from "@aven/agents/tools/create-bot";
import type { UpdateSelf } from "@aven/agents/tools/update-self";
import type { ScheduleHost } from "@aven/agents/tools/schedules";
import type { SendMessage } from "@aven/agents/tools/send-message";
import { parseBotPrompt, USER_HANDLE } from "@aven/protocol/bots";
import type { BotScheduleView } from "@aven/protocol/schedules";
import { SHOW_IMAGE_TOOL_NAME } from "@aven/protocol/events";
import type {
  BotPeer,
  BotReplyInfo,
  ControlPlaneToRuntime,
  RunModel,
  RuntimeCalls,
  RuntimeToControlPlane,
} from "@aven/protocol/runtime-wire";

import { boundedTools } from "./late-bound-tools";
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
  /** The person's schedules, which the bot may look at and, on their word, change (decision 0067). */
  schedules: ScheduleHost;
  /** The bots this one may write to: the reply's own list, to which a bot it makes is added (decision 0065). */
  peers: BotPeer[];
  /** Changes the bot's own name, description or instruction (decision 0061). */
  updateSelf: UpdateSelf;
}) => Pick<Agent<unknown>, "generate">;

// Builds the agent as a run's is: the model is reached through the control plane's gateway with the
// reply's token, so this process holds no provider key.
export const defaultCreateBotAgent =
  (origin: string): CreateBotReplyAgent =>
  ({ bot, model, send, memory, computer, createBot, askQuestion, schedules, peers, updateSelf }) =>
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
      schedules,
      timezone: bot.timezone,
      peers,
      description: bot.description,
      updateSelf,
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

type Reply = { botId: string; abort: AbortController };

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
    this.#live.set(message.replyId, { botId: message.bot.id, abort });
    void this.#answer(message, abort);
  }

  cancel(replyId: string, reason: string) {
    this.#live.get(replyId)?.abort.abort(new Error(reason));
  }

  abortAll(reason: string) {
    for (const reply of this.#live.values()) reply.abort.abort(new Error(reason));
  }

  // One reply, which never throws: how it ended is told to the control plane.
  async #answer({ replyId, bot, prompt, model }: BotReplyMessage, abort: AbortController) {
    const { send } = this.#context;
    const { signal } = abort;
    try {
      const agent = await this.#agentFor(replyId, bot, prompt, model, abort);
      await agent.generate({ prompt, session: { sessionId: bot.id }, abortSignal: signal });
      send({ type: "bot.end", replyId });
    } catch (error) {
      send({ type: "bot.end", replyId, error: errorMessage(signal.reason ?? error) });
    } finally {
      this.#live.delete(replyId);
      this.#context.finished(bot.id);
    }
  }

  async #agentFor(
    replyId: string,
    bot: BotReplyInfo,
    prompt: string,
    model: RunModel,
    abort: AbortController,
  ) {
    const { sandbox, boxes, starting, call, send: post, createAgent } = this.#context;
    await starting(bot.id);
    abort.signal.throwIfAborted();
    const box = await sandbox.acquire({ id: bot.id });
    boxes.set(bot.id, box);
    // What a bot sends the person is shown as typed; what it sends another bot goes at once, and
    // the other bot's answer is a message of its own (decision 0065).
    const peers = [...bot.peers];
    const send: SendMessage = async ({ to, text }, { abortSignal }) => {
      if (to !== USER_HANDLE) {
        const sent = await call("bot.send", { replyId, to, text });
        return `Sent to ${sent.name} (${sent.handle}).`;
      }
      await this.#pause(typingDelay(text), abortSignal);
      if (post({ type: "bot.say", replyId, text })) return "Sent to the person.";
      // A tool's error goes back to the model, which could try again; the reply is over instead.
      const lost = new Error("The connection to the control plane dropped");
      abort.abort(lost);
      throw lost;
    };
    return createAgent({
      bot,
      model,
      send,
      peers,
      memory: {
        store: remoteBotMemory(replyId, (params) => call("bot.memory", params)),
        savePolicy: "turn",
      },
      computer: boundedTools(box.tools.filter((tool) => tool.name !== SHOW_IMAGE_TOOL_NAME)),
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
        : (questions) => call("bot.question", { replyId, questions }),
      updateSelf: (changes) => call("bot.update", { ...changes, replyId }),
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
