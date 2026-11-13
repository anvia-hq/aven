import type { MemoryStore } from "@anvia/core";
import { botMessagesToChat } from "@aven/agents/bot-projection";
import {
  applyBotEvent,
  BOT_REACTIONS_MAX,
  incomingMessageId,
  botMessagePrompt,
  botNote,
  botPrompt,
  isTyping,
  personPrompt,
  sentMessageId,
} from "@aven/protocol/bots";

import { withoutBytes } from "../../attachments";
import { ConflictError, describeError, UnavailableError, UnprocessableError } from "../../errors";
import type { BotDelivery, BotReplier, BotReplyInput, BotSettled } from "./types";
import type { ModelConfig } from "@aven/agents/types";
import type {
  Bot,
  BotChatMessage,
  BotChatPeer,
  BotChatQuote,
  BotEvent,
  BotReacted,
  RunAttachment,
} from "@aven/protocol/types";

const PING_MS = 5_000;

const MAX_PENDING = 5;

type ReplyRequest = Omit<BotReplyInput, "say" | "ask" | "react" | "activity" | "signal" | "prompt">;

type AnswerRequest = ReplyRequest & { prompt: string };

type Shown = Pick<BotChatMessage, "text" | "peer" | "attachments"> & { quoteId?: string };

type Channel = {
  botId: string;
  userId: string;
  messages: BotChatMessage[];
  typing: boolean;
  activity: string | null;
  pending: number;
  tail: Promise<void>;
  subscribers: Set<(event: BotEvent) => void>;
  loaded: Promise<void>;
};

export class BotRunner {
  #channels = new Map<string, Channel>();
  #watchers = new Map<string, Set<() => void>>();
  #store: MemoryStore;
  #replier: BotReplier;
  #settled?: BotSettled;
  #shutdown = new AbortController();

  constructor(deps: { store: MemoryStore; replier: BotReplier; settled?: BotSettled }) {
    this.#store = deps.store;
    this.#replier = deps.replier;
    this.#settled = deps.settled;
  }

  async send(
    bot: Bot,
    userId: string,
    text: string,
    model: ModelConfig,
    attachments: RunAttachment[] = [],
    quoteId?: string,
  ) {
    await this.#enqueue({
      bot,
      userId,
      model,
      body: personPrompt(text),
      attachments,
      hops: 0,
      onPersonsWord: true,
      shown: { text, attachments: attachments.map(withoutBytes), quoteId },
    });
  }

  async deliver({ bot, userId, from, text, hops, relaysPersonsWord, model }: BotDelivery) {
    const peer = { id: from.id, name: from.name, handle: from.handle };
    await this.#enqueue({
      bot,
      userId,
      model,
      body: botPrompt(from.handle, text),
      hops,
      onPersonsWord: relaysPersonsWord,
      shown: { text, peer: { ...peer, direction: "from" } },
    });
  }

  async wake(
    bot: Bot,
    userId: string,
    note: string,
    hops: number,
    model: ModelConfig,
    aboutThread?: string,
  ) {
    await this.#enqueue({
      bot,
      userId,
      model,
      body: botNote(note),
      hops,
      onPersonsWord: false,
      aboutThread,
      shown: null,
    });
  }

  note(botId: string, role: BotChatMessage["role"], text: string, peer: BotChatPeer) {
    const channel = this.#channels.get(botId);

    if (channel) this.#say(channel, role, text, { peer });
  }

  async #enqueue(input: ReplyRequest & { body: string; shown: Shown | null }) {
    const { shown, body, ...reply } = input;
    this.#replier.ready(reply.model, reply.bot);
    const channel = await this.#open(reply.bot.id, reply.userId);

    if (channel.pending >= MAX_PENDING) {
      throw new ConflictError("The bot has a lot to answer already; give it a moment");
    }

    const id = incomingMessageId(
      channel.messages.filter((message) => message.role === "user").length,
    );
    const quoted = shown?.quoteId ? this.#quotedOf(channel, shown.quoteId) : undefined;

    if (shown?.quoteId && !quoted) {
      throw new UnprocessableError("That message is not in this chat, so it cannot be quoted");
    }

    this.#channels.set(reply.bot.id, channel);

    if (shown) {
      this.#say(channel, "user", shown.text, {
        peer: shown.peer,
        attachments: shown.attachments,
        quote: quoted,
      });
    }

    channel.pending += 1;

    if (channel.pending === 1) this.#emit(channel, { type: "typing", typing: true });

    const prompt = shown ? botMessagePrompt(id, body, quoted) : body;
    channel.tail = channel.tail.then(() => this.#reply({ ...reply, prompt }, channel));
  }

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
      {
        type: "snapshot",
        messages: channel.messages,
        typing: channel.typing,
        activity: channel.activity ?? undefined,
      },
      signal,
    );
  }

  busy(botId: string) {
    return (this.#channels.get(botId)?.pending ?? 0) >= MAX_PENDING;
  }

  isIdle(botId: string) {
    return (this.#channels.get(botId)?.pending ?? 0) === 0;
  }

  workingOf(userId: string) {
    return [...this.#channels.values()]
      .filter((channel) => channel.userId === userId && channel.typing)
      .map((channel) => channel.botId);
  }

  isWatching(userId: string) {
    return this.#watchers.has(userId);
  }

  working(userId: string, signal: AbortSignal): AsyncGenerator<string[] | null> {
    return this.#follow<string[]>(
      (listener) => {
        const watcher = () => listener(this.workingOf(userId));
        const watchers = this.#watchers.get(userId) ?? new Set();
        watchers.add(watcher);
        this.#watchers.set(userId, watchers);
        return () => {
          watchers.delete(watcher);

          if (watchers.size === 0) this.#watchers.delete(userId);
        };
      },
      this.workingOf(userId),
      signal,
    );
  }

  async *#follow<T>(
    attach: (listener: (item: T) => void) => () => void,
    first: T,
    signal: AbortSignal,
  ): AsyncGenerator<T | null> {
    const queue: T[] = [];
    let wake: (() => void) | undefined;
    let detach: (() => void) | undefined;
    try {
      detach = attach((item) => {
        queue.push(item);
        wake?.();
      });
      const aborted = new Promise<undefined>((resolve) => {
        signal.addEventListener("abort", () => resolve(undefined), { once: true });
      });
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
      detach?.();
    }
  }

  dispose() {
    this.#shutdown.abort(new Error("Shutting down"));
  }

  #scope(botId: string, userId: string) {
    return { sessionId: botId, userId };
  }

  async #open(botId: string, userId: string) {
    let channel = this.#channels.get(botId);

    if (!channel) {
      const made: Channel = {
        botId,
        userId,
        messages: [],
        typing: false,
        activity: null,
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

  #release(botId: string, channel: Channel) {
    if (channel.subscribers.size === 0 && channel.pending === 0) this.#channels.delete(botId);
  }

  #say(
    channel: Channel,
    role: BotChatMessage["role"],
    text: string,
    {
      peer,
      questions,
      attachments,
      artifacts,
      quote,
    }: Pick<BotChatMessage, "peer" | "questions" | "attachments" | "artifacts"> & {
      quote?: BotChatQuote;
    } = {},
  ) {
    const message: BotChatMessage = {
      id:
        role === "user"
          ? incomingMessageId(channel.messages.filter((each) => each.role === "user").length)
          : sentMessageId(channel.messages.filter((each) => each.role === "bot").length),
      role,
      text,
    };

    if (peer) message.peer = peer;

    if (questions) message.questions = questions;

    if (attachments?.length) message.attachments = attachments;

    if (artifacts?.length) message.artifacts = artifacts;

    if (quote) message.quote = quote;

    this.#emit(channel, { type: "message", message });
  }

  #quotedOf(channel: Channel, id: string): BotChatQuote | undefined {
    const quoted = channel.messages.find((message) => message.id === id);

    if (!quoted) return undefined;

    return quoted.peer
      ? { id: quoted.id, role: quoted.role, text: quoted.text, peer: quoted.peer }
      : { id: quoted.id, role: quoted.role, text: quoted.text };
  }

  #react(channel: Channel, messageId: string, emoji: string): BotReacted {
    const target = channel.messages.find((message) => message.id === messageId);

    if (!target) {
      throw new UnprocessableError(
        `There is no message ${messageId} in this chat; react by its id`,
      );
    }

    const reactions = target.reactions ?? [];

    if (reactions.includes(emoji)) return { messageId };

    if (reactions.length >= BOT_REACTIONS_MAX) {
      throw new UnprocessableError(`That message has ${BOT_REACTIONS_MAX} reactions already`);
    }

    this.#emit(channel, { type: "reaction", messageId, emoji });
    return { messageId };
  }

  #emit(channel: Channel, event: BotEvent) {
    channel.messages = applyBotEvent(channel.messages, event);
    const working = channel.typing;
    channel.typing = isTyping(channel.typing, event);

    if (event.type === "activity") channel.activity = event.label;

    if (!channel.typing) channel.activity = null;

    for (const subscriber of channel.subscribers) subscriber(event);

    if (channel.typing !== working) {
      for (const watcher of this.#watchers.get(channel.userId) ?? []) watcher();
    }
  }

  async #afterReply(input: AnswerRequest, channel: Channel, ok: boolean) {
    if (!this.#settled || channel.pending !== 1 || this.#shutdown.signal.aborted) return;

    const { bot, userId, prompt } = input;
    await this.#settled({ userId, botId: bot.id, prompt, ok }).catch((error: unknown) => {
      console.warn(`The goal of bot ${bot.id} could not go on:`, describeError(error));
    });
  }

  async #reply(input: AnswerRequest, channel: Channel) {
    const { bot } = input;
    let ok = false;
    try {
      await this.#replier.answer({
        ...input,
        say: (text, quoteId, files) =>
          this.#say(channel, "bot", text, {
            quote: quoteId ? this.#quotedOf(channel, quoteId) : undefined,
            artifacts: files,
          }),
        ask: (questions) =>
          this.#say(channel, "bot", questions.map((question) => question.text).join("\n"), {
            questions,
          }),
        react: (messageId, emoji) => this.#react(channel, messageId, emoji),
        activity: (label) => {
          if (channel.typing && channel.activity !== label) {
            this.#emit(channel, { type: "activity", label });
          }
        },
        signal: this.#shutdown.signal,
      });
      ok = true;
    } catch (failure) {
      if (!this.#shutdown.signal.aborted) {
        console.warn(`Bot ${bot.id} could not reply:`, failure);
        this.#emit(channel, { type: "error", message: describeError(failure) });
      }
    } finally {
      await this.#afterReply(input, channel, ok);
      channel.pending -= 1;

      if (channel.pending === 0) this.#emit(channel, { type: "typing", typing: false });

      this.#release(bot.id, channel);
    }
  }
}
