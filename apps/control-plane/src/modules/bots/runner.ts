import type { MemoryStore } from "@anvia/core";
import { botMessagesToChat } from "@aven/agents/bot-projection";
import type { ModelConfig } from "@aven/agents/model";
import {
  applyBotEvent,
  botMessageId,
  botNote,
  botPrompt,
  isTyping,
  type Bot,
  type BotChatMessage,
  type BotChatPeer,
  type BotEvent,
  type BotQuestion,
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
  /** What the person, or another bot, said. */
  prompt: string;
  /** How many messages between bots led to this one: none when the person said it (decision 0065). */
  hops: number;
  /** Shows a message the bot sent the person, once it has been "typed". */
  say(text: string): void;
  /** Shows the person a question the bot asks, as a card (decision 0066). */
  ask(questions: BotQuestion[]): void;
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
  botId: string;
  userId: string;
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
  // Who is watching which person's bots at work, to be told when one starts or stops.
  #watchers = new Map<string, Set<() => void>>();
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
    await this.#enqueue({ bot, userId, model, prompt: text, hops: 0, shown: { text } });
  }

  // Another bot writes to this one (decision 0065). The message waits its turn like the person's
  // and is in the chat as a message between bots; the bot answers it, if it does, by writing back,
  // which is a message in the other's chat in the same way. `hops` counts the messages between bots
  // that led here.
  async deliver(
    bot: Bot,
    userId: string,
    from: Pick<Bot, "id" | "name" | "handle">,
    text: string,
    hops: number,
    model: ModelConfig,
  ) {
    const peer = { id: from.id, name: from.name, handle: from.handle };
    await this.#enqueue({
      bot,
      userId,
      model,
      prompt: botPrompt(from.handle, text),
      hops,
      shown: { text, peer: { ...peer, direction: "from" } },
    });
  }

  // The app wakes the bot with a note the chat does not show, such as to greet its person when it
  // was just made (decision 0063). What the bot says is in the chat as usual. `hops` is how many
  // messages between bots led to the wake, so a bot made at the end of a chain starts none afresh.
  async wake(bot: Bot, userId: string, note: string, hops: number, model: ModelConfig) {
    await this.#enqueue({ bot, userId, model, prompt: botNote(note), hops, shown: null });
  }

  // Adds a message to the bot's chat as it is open now, when it is: the chat of a bot that wrote to
  // another bot, whose message belongs in it (decision 0065).
  note(botId: string, role: BotChatMessage["role"], text: string, peer: BotChatPeer) {
    const channel = this.#channels.get(botId);
    if (channel) this.#say(channel, role, text, peer);
  }

  // Puts one message in the chat, if it is to be shown, and the reply it asks for in line, behind
  // those already there. Resolves once it is in line.
  async #enqueue(
    input: Omit<BotReplyInput, "say" | "ask" | "signal"> & {
      shown: { text: string; peer?: BotChatPeer } | null;
    },
  ) {
    const { shown, ...reply } = input;
    this.#replier.ready(reply.model);
    const channel = await this.#open(reply.bot.id, reply.userId);
    if (channel.pending >= MAX_PENDING) {
      throw new ConflictError("The bot has a lot to answer already; give it a moment");
    }
    // A client may have detached while this waited, which dropped the channel; it is in use again.
    this.#channels.set(reply.bot.id, channel);
    if (shown) this.#say(channel, "user", shown.text, shown.peer);
    channel.pending += 1;
    if (channel.pending === 1) this.#emit(channel, { type: "typing", typing: true });
    channel.tail = channel.tail.then(() => this.#reply(reply, channel));
  }

  // Attaches a client: yields the chat, then live events, with `null` as a keep-alive tick.
  // Dropping the iterator detaches the client and leaves any reply untouched.
  async *events(
    botId: string,
    userId: string,
    signal: AbortSignal,
  ): AsyncGenerator<BotEvent | null> {
    const channel = await this.#open(botId, userId);
    yield* this.#follow<BotEvent>(
      (listener) => {
        channel.subscribers.add(listener);
        return () => {
          channel.subscribers.delete(listener);
          this.#release(botId, channel);
        };
      },
      { type: "snapshot", messages: channel.messages, typing: channel.typing },
      signal,
    );
  }

  /** The ids of the person's bots that are at work on a reply now. */
  workingOf(userId: string) {
    return [...this.#channels.values()]
      .filter((channel) => channel.userId === userId && channel.typing)
      .map((channel) => channel.botId);
  }

  // Which of a person's bots are at work, now and each time that changes, with `null` as a
  // keep-alive tick: what the sidebar draws as open eyes (decision 0064).
  working(userId: string, signal: AbortSignal): AsyncGenerator<string[] | null> {
    return this.#follow<string[]>(
      (listener) => {
        const watcher = () => listener(this.workingOf(userId));
        const watchers = this.#watchers.get(userId) ?? new Set();
        watchers.add(watcher);
        this.#watchers.set(userId, watchers);
        return () => void watchers.delete(watcher);
      },
      this.workingOf(userId),
      signal,
    );
  }

  // What a client is shown: `first`, then what `attach`'s listener is given, with `null` ticks.
  async *#follow<T>(
    attach: (listener: (item: T) => void) => () => void,
    first: T,
    signal: AbortSignal,
  ): AsyncGenerator<T | null> {
    const queue: T[] = [];
    let wake: (() => void) | undefined;
    const detach = attach((item) => {
      queue.push(item);
      wake?.();
    });
    const aborted = new Promise<undefined>((resolve) => {
      signal.addEventListener("abort", () => resolve(undefined), { once: true });
    });
    try {
      yield first;
      while (!signal.aborted) {
        const item = queue.shift();
        if (item !== undefined) {
          yield item;
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
      detach();
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
        botId,
        userId,
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

  #say(
    channel: Channel,
    role: BotChatMessage["role"],
    text: string,
    peer?: BotChatPeer,
    questions?: BotQuestion[],
  ) {
    const message: BotChatMessage = { id: botMessageId(channel.messages.length), role, text };
    if (peer) message.peer = peer;
    if (questions) message.questions = questions;
    this.#emit(channel, { type: "message", message });
  }

  #emit(channel: Channel, event: BotEvent) {
    channel.messages = applyBotEvent(channel.messages, event);
    const working = channel.typing;
    channel.typing = isTyping(channel.typing, event);
    for (const subscriber of channel.subscribers) subscriber(event);
    if (channel.typing !== working) {
      for (const watcher of this.#watchers.get(channel.userId) ?? []) watcher();
    }
  }

  // One reply. It never throws: a failure is told to the clients, and the next reply goes on.
  async #reply(input: Omit<BotReplyInput, "say" | "ask" | "signal">, channel: Channel) {
    const { bot } = input;
    try {
      await this.#replier.answer({
        ...input,
        say: (text) => this.#say(channel, "bot", text),
        ask: (questions) =>
          this.#say(
            channel,
            "bot",
            questions.map((question) => question.text).join("\n"),
            undefined,
            questions,
          ),
        signal: this.#shutdown.signal,
      });
    } catch (failure) {
      if (!this.#shutdown.signal.aborted) {
        console.warn(`Bot ${bot.id} could not reply:`, failure);
        this.#emit(channel, { type: "error", message: describeError(failure) });
      }
    } finally {
      channel.pending -= 1;
      if (channel.pending === 0) this.#emit(channel, { type: "typing", typing: false });
      this.#release(bot.id, channel);
    }
  }
}
