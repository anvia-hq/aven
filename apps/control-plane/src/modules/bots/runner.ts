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
} from "@aven/protocol/bots";
import type { RunAttachment } from "@aven/protocol/runtime-wire";

import { withoutBytes } from "../../attachments";
import { ConflictError, describeError, UnavailableError } from "../../errors";
import type { BotDelivery, BotReplier, BotReplyInput, BotSettled } from "./types";

const PING_MS = 5_000;

const MAX_PENDING = 5;

type ReplyRequest = Omit<BotReplyInput, "say" | "ask" | "signal">;

type Channel = {
  botId: string;
  userId: string;
  messages: BotChatMessage[];
  typing: boolean;
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
  ) {
    await this.#enqueue({
      bot,
      userId,
      model,
      prompt: text,
      attachments,
      hops: 0,
      onPersonsWord: true,
      shown: { text, attachments: attachments.map(withoutBytes) },
    });
  }

  async deliver({ bot, userId, from, text, hops, relaysPersonsWord, model }: BotDelivery) {
    const peer = { id: from.id, name: from.name, handle: from.handle };
    await this.#enqueue({
      bot,
      userId,
      model,
      prompt: botPrompt(from.handle, text),
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
      prompt: botNote(note),
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

  async #enqueue(
    input: ReplyRequest & {
      shown: Pick<BotChatMessage, "text" | "peer" | "attachments"> | null;
    },
  ) {
    const { shown, ...reply } = input;
    this.#replier.ready(reply.model);
    const channel = await this.#open(reply.bot.id, reply.userId);
    if (channel.pending >= MAX_PENDING) {
      throw new ConflictError("The bot has a lot to answer already; give it a moment");
    }
    this.#channels.set(reply.bot.id, channel);
    if (shown) this.#say(channel, "user", shown.text, shown);
    channel.pending += 1;
    if (channel.pending === 1) this.#emit(channel, { type: "typing", typing: true });
    channel.tail = channel.tail.then(() => this.#reply(reply, channel));
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
      { type: "snapshot", messages: channel.messages, typing: channel.typing },
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
    }: Pick<BotChatMessage, "peer" | "questions" | "attachments"> = {},
  ) {
    const message: BotChatMessage = { id: botMessageId(channel.messages.length), role, text };
    if (peer) message.peer = peer;
    if (questions) message.questions = questions;
    if (attachments?.length) message.attachments = attachments;
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

  async #afterReply(input: ReplyRequest, channel: Channel, ok: boolean) {
    if (!this.#settled || channel.pending !== 1 || this.#shutdown.signal.aborted) return;
    const { bot, userId, prompt } = input;
    await this.#settled({ userId, botId: bot.id, prompt, ok }).catch((error: unknown) => {
      console.warn(`The goal of bot ${bot.id} could not go on:`, describeError(error));
    });
  }

  async #reply(input: ReplyRequest, channel: Channel) {
    const { bot } = input;
    let ok = false;
    try {
      await this.#replier.answer({
        ...input,
        say: (text) => this.#say(channel, "bot", text),
        ask: (questions) =>
          this.#say(channel, "bot", questions.map((question) => question.text).join("\n"), {
            questions,
          }),
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
