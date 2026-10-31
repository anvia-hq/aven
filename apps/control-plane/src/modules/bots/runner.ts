import type { MemoryStore } from "@anvia/core";
import { botMessagesToChat } from "@aven/agents/bot-projection";
import type { ModelConfig } from "@aven/agents/model";
import {
  applyBotEvent,
  botMessageId,
  botPrompt,
  isTyping,
  type Bot,
  type BotChatMessage,
  type BotEvent,
} from "@aven/protocol/bots";

import { ConflictError, describeError, UnavailableError } from "../../errors";

const PING_MS = 5_000;

// How many replies a bot may owe at once: the one it is on and those waiting behind it.
const MAX_PENDING = 5;

/** What answering one message of a bot needs (decision 0059). */
export type BotReplyInput = {
  bot: Bot;
  userId: string;
  model: ModelConfig;
  /** What the person said. */
  prompt: string;
  /** Shows a message the bot sent, once it has been "typed". */
  say(text: string): void;
  /** Stops the reply: a shutdown. */
  signal: AbortSignal;
};

/** How a bot answers: the runner it works on is behind this, so the chat does not depend on it. */
export type BotReplier = {
  /** Throws when the bot cannot answer now (its computer is offline, or the model has no key), before a message is added. */
  ready(model: ModelConfig): void;
  /** Resolves when the bot has said all it will; rejects when it could not. */
  answer(input: BotReplyInput): Promise<void>;
};

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
  #replier: BotReplier;
  #shutdown = new AbortController();

  constructor(deps: { store: MemoryStore; replier: BotReplier }) {
    this.#store = deps.store;
    this.#replier = deps.replier;
  }

  // The person says something to the bot. Returns once the message is in the chat; the reply
  // comes as events. Throws if the bot cannot answer now, before anything is added.
  async send(bot: Bot, userId: string, text: string, model: ModelConfig) {
    await this.#enqueue({ bot, userId, model, prompt: text });
  }

  // Another bot writes to this one (decision 0063). The message waits its turn like the person's
  // and is shown in the chat as the other bot's; the reply is the bot's as always, shown to the
  // person too, and what it sent comes back to the asker. Resolves when the reply is over.
  async ask(bot: Bot, userId: string, from: string, text: string, model: ModelConfig) {
    const { answered } = await this.#enqueue({
      bot,
      userId,
      model,
      prompt: botPrompt(from, text),
      from,
      shown: text,
    });
    return answered;
  }

  // Puts one message in the chat and the reply it asks for in line, behind those already there.
  // Resolves once it is in line, with the reply to wait for: inside an object, since a promise
  // returned from here would be waited for.
  async #enqueue(input: Omit<BotReplyInput, "say" | "signal"> & { from?: string; shown?: string }) {
    const { bot, userId, model, prompt, from, shown = prompt } = input;
    this.#replier.ready(model);
    const channel = await this.#open(bot.id, userId);
    if (channel.pending >= MAX_PENDING) {
      throw new ConflictError("The bot has a lot to answer already; give it a moment");
    }
    // A client may have detached while this waited, which dropped the channel; it is in use again.
    this.#channels.set(bot.id, channel);
    this.#say(channel, "user", shown, from);
    channel.pending += 1;
    if (channel.pending === 1) this.#emit(channel, { type: "typing", typing: true });
    const answered = channel.tail.then(() => this.#reply({ bot, userId, model, prompt }, channel));
    channel.tail = answered.then(() => undefined);
    return { answered };
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

  #say(channel: Channel, role: BotChatMessage["role"], text: string, from?: string) {
    const message: BotChatMessage = { id: botMessageId(channel.messages.length), role, text };
    if (from) message.from = from;
    this.#emit(channel, { type: "message", message });
  }

  #emit(channel: Channel, event: BotEvent) {
    channel.messages = applyBotEvent(channel.messages, event);
    channel.typing = isTyping(channel.typing, event);
    for (const subscriber of channel.subscribers) subscriber(event);
  }

  // One reply. It never throws: a failure is told to the clients, and the next reply goes on. What
  // the bot sent, and why it failed if it did, is what a bot that asked for it is told.
  async #reply(input: Omit<BotReplyInput, "say" | "signal">, channel: Channel) {
    const { bot } = input;
    const said: string[] = [];
    let error: string | undefined;
    try {
      await this.#replier.answer({
        ...input,
        say: (text) => {
          said.push(text);
          this.#say(channel, "bot", text);
        },
        signal: this.#shutdown.signal,
      });
    } catch (failure) {
      if (!this.#shutdown.signal.aborted) {
        console.warn(`Bot ${bot.id} could not reply:`, failure);
        error = describeError(failure);
        this.#emit(channel, { type: "error", message: error });
      }
    } finally {
      channel.pending -= 1;
      if (channel.pending === 0) this.#emit(channel, { type: "typing", typing: false });
      this.#release(bot.id, channel);
    }
    return { said, error };
  }
}
