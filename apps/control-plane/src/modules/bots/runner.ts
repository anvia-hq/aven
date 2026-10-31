import type { AgentMemoryOptions, MemoryStore } from "@anvia/core";
import { createBotAgent } from "@aven/agents/bot-agent";
import { typingDelay } from "@aven/agents/bot-delay";
import { botMessagesToChat } from "@aven/agents/bot-projection";
import type { ModelConfig } from "@aven/agents/model";
import type { DeliverMessage } from "@aven/agents/tools/send-message";
import {
  applyBotEvent,
  botMessageId,
  isTyping,
  type Bot,
  type BotChatMessage,
  type BotEvent,
} from "@aven/protocol/bots";

import { ConflictError, describeError, UnavailableError } from "../../errors";

const PING_MS = 5_000;

// How many replies a bot may owe at once: the one it is on and those waiting behind it.
const MAX_PENDING = 5;

type BotAgent = Pick<ReturnType<typeof createBotAgent>, "generate">;

/** Makes the agent of one message. Tests make theirs with a scripted model. */
export type CreateBotAgent = (input: {
  bot: Bot;
  model: ModelConfig;
  deliver: DeliverMessage;
  memory: AgentMemoryOptions;
}) => BotAgent;

const defaultCreateAgent: CreateBotAgent = ({ bot, model, deliver, memory }) =>
  createBotAgent({
    ...model,
    id: bot.id,
    name: bot.name,
    instruction: bot.instruction,
    deliver,
    memory,
  });

// What makes a message "typed": the wait before it shows, which a cancel cuts short.
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

type Channel = {
  /** The chat so far, kept current by applying events, so a client that connects gets it whole. */
  messages: BotChatMessage[];
  typing: boolean;
  /** Replies the bot owes: the one it is working on and those waiting behind it. */
  pending: number;
  /** The replies, one after another: the end of the line. */
  tail: Promise<void>;
  subscribers: Set<(event: BotEvent) => void>;
  /** Settles once the stored chat has been read. */
  loaded: Promise<void>;
};

// Runs the chats of bots (decision 0058). A message starts a reply, which is the bot sending
// messages one after another; messages that come while it is at work wait their turn, so what the
// bot remembers is always in the order it was said. Like a thread's run, a reply belongs to the
// server: a client that disconnects loses nothing and finds the chat as it is.
export class BotRunner {
  #channels = new Map<string, Channel>();
  #store: MemoryStore;
  #createAgent: CreateBotAgent;
  #pause: (ms: number, signal?: AbortSignal) => Promise<void>;
  #shutdown = new AbortController();

  constructor(deps: {
    store: MemoryStore;
    createAgent?: CreateBotAgent;
    pause?: (ms: number, signal?: AbortSignal) => Promise<void>;
  }) {
    this.#store = deps.store;
    this.#createAgent = deps.createAgent ?? defaultCreateAgent;
    this.#pause = deps.pause ?? sleep;
  }

  // The person says something to the bot. Returns once the message is in the chat; the reply
  // comes as events. Throws if the model cannot be used, before anything is added.
  async send(bot: Bot, userId: string, text: string, model: ModelConfig) {
    const channel = await this.#open(bot.id, userId);
    if (channel.pending >= MAX_PENDING) {
      throw new ConflictError("The bot has a lot to answer already; give it a moment");
    }
    // A client may have detached while this waited, which dropped the channel; it is in use again.
    this.#channels.set(bot.id, channel);
    const session = this.#scope(bot.id, userId);
    const deliver: DeliverMessage = async (message, { abortSignal }) => {
      await this.#pause(typingDelay(message), abortSignal);
      this.#say(channel, "bot", message);
    };
    let agent: BotAgent;
    try {
      agent = this.#createAgent({
        bot,
        model,
        deliver,
        memory: { store: this.#store, savePolicy: "turn" },
      });
    } catch (error) {
      throw new UnavailableError(describeError(error));
    }

    this.#say(channel, "user", text);
    channel.pending += 1;
    if (channel.pending === 1) this.#emit(channel, { type: "typing", typing: true });
    channel.tail = channel.tail.then(() => this.#reply(bot, channel, agent, text, session));
  }

  // Attaches a client: yields the chat, then live events, with `null` as a keep-alive tick.
  // Dropping the iterator detaches the client and leaves any reply untouched.
  async *events(
    botId: string,
    userId: string,
    signal: AbortSignal,
  ): AsyncGenerator<BotEvent | null> {
    const channel = await this.#open(botId, userId);
    const queue: BotEvent[] = [];
    let wake: (() => void) | undefined;
    const listener = (event: BotEvent) => {
      queue.push(event);
      wake?.();
    };
    channel.subscribers.add(listener);
    const aborted = new Promise<undefined>((resolve) => {
      signal.addEventListener("abort", () => resolve(undefined), { once: true });
    });
    try {
      yield { type: "snapshot", messages: channel.messages, typing: channel.typing };
      while (!signal.aborted) {
        const event = queue.shift();
        if (event) {
          yield event;
          continue;
        }
        const timer = Bun.sleep(PING_MS).then(() => null);
        const arrived = new Promise<undefined>((resolve) => {
          wake = () => resolve(undefined);
        });
        const woke = await Promise.race([arrived, aborted, timer]);
        wake = undefined;
        if (woke === null && queue.length === 0 && !signal.aborted) yield null;
      }
    } finally {
      channel.subscribers.delete(listener);
      this.#release(botId, channel);
    }
  }

  // Stops every reply. Call on host shutdown.
  dispose() {
    this.#shutdown.abort(new Error("Shutting down"));
  }

  #scope(botId: string, userId: string) {
    return { sessionId: botId, userId };
  }

  // The bot's channel, with its stored chat read. The first to ask reads it; the others wait.
  async #open(botId: string, userId: string) {
    let channel = this.#channels.get(botId);
    if (!channel) {
      const made: Channel = {
        messages: [],
        typing: false,
        pending: 0,
        tail: Promise.resolve(),
        subscribers: new Set(),
        loaded: Promise.resolve(),
      };
      made.loaded = this.#store.load({ scope: this.#scope(botId, userId) }).then((history) => {
        made.messages = botMessagesToChat(history);
      });
      this.#channels.set(botId, made);
      channel = made;
    }
    try {
      await channel.loaded;
    } catch (error) {
      this.#channels.delete(botId);
      console.warn(`Could not load the chat of bot ${botId}:`, error);
      throw new UnavailableError("The chat could not be loaded; try again shortly");
    }
    return channel;
  }

  // A channel nobody is watching and nothing is working on is dropped; the store has the chat.
  #release(botId: string, channel: Channel) {
    if (channel.subscribers.size === 0 && channel.pending === 0) this.#channels.delete(botId);
  }

  #say(channel: Channel, role: BotChatMessage["role"], text: string) {
    const message = { id: botMessageId(channel.messages.length), role, text };
    this.#emit(channel, { type: "message", message });
  }

  #emit(channel: Channel, event: BotEvent) {
    channel.messages = applyBotEvent(channel.messages, event);
    channel.typing = isTyping(channel.typing, event);
    for (const subscriber of channel.subscribers) subscriber(event);
  }

  // One reply. It never throws: a failure is told to the clients, and the next reply goes on.
  async #reply(
    bot: Bot,
    channel: Channel,
    agent: BotAgent,
    text: string,
    session: { sessionId: string; userId: string },
  ) {
    try {
      await agent.generate({ prompt: text, session, abortSignal: this.#shutdown.signal });
    } catch (error) {
      if (!this.#shutdown.signal.aborted) {
        console.warn(`Bot ${bot.id} could not reply:`, error);
        this.#emit(channel, { type: "error", message: describeError(error) });
      }
    } finally {
      channel.pending -= 1;
      if (channel.pending === 0) this.#emit(channel, { type: "typing", typing: false });
      this.#release(bot.id, channel);
    }
  }
}
