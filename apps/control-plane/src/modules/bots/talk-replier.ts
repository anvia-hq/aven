import type { MemoryStore } from "@anvia/core";
import { sentPrompt } from "@aven/agents/attachments";
import { createBotAgent } from "@aven/agents/bot-agent";
import { typingDelay } from "@aven/agents/bot-delay";
import { USER_HANDLE } from "@aven/protocol/bots";
import { UnavailableError } from "@aven/server-kit/errors";

import { webSearchForRun } from "../runs/web-search";
import type { BotKeeper, BotReplier, BotReplyInput } from "./types";
import type { ModelConfig } from "@aven/agents/types";
import type { BotRunChoice } from "../providers/types";
import type { Bot, RunAttachment } from "@aven/protocol/types";

export const NO_COMPUTER = "This bot has no computer";

type Wait = (ms: number, signal?: AbortSignal) => Promise<void>;

export class TalkBotReplier implements BotReplier {
  constructor(
    private store: MemoryStore,
    private bots: Pick<BotKeeper, "list" | "deliver">,
    private wait: Wait = pause,
    private agent: typeof createBotAgent = createBotAgent,
  ) {}

  ready(choice: BotRunChoice, bot: Pick<Bot, "hasComputer">) {
    if (bot.hasComputer) return;

    if (choice.backend !== "native") {
      throw new UnavailableError(
        `${NO_COMPUTER}. A subscription agent needs a computer; choose a model provider instead.`,
      );
    }

    if (!choice.model) throw new UnavailableError("This bot has no model to answer with");
  }

  async answer(input: BotReplyInput) {
    if (input.bot.hasComputer) throw new UnavailableError("This bot answers on its computer");

    const { choice } = input;

    if (choice.backend !== "native" || !choice.model) throw new UnavailableError(NO_COMPUTER);

    await this.#talk(input, choice.model);
  }

  async #talk(input: BotReplyInput, model: ModelConfig) {
    const {
      bot,
      userId,
      prompt,
      attachments,
      hops,
      onPersonsWord,
      say,
      ask,
      react,
      activity,
      signal,
    } = input;
    signal.throwIfAborted();
    const peers = await this.#peers(userId, bot.id);
    const asked = sentPrompt(prompt, {
      attachments: (attachments ?? []).map(held),
      images: imagesOf(attachments),
    });
    const agent = this.agent({
      ...model,
      id: bot.id,
      name: bot.name,
      handle: bot.handle,
      instruction: bot.instruction,
      description: bot.description,
      compactAfterTokens: bot.compactAfterTokens ?? undefined,
      peers,
      webSearch: webSearchForRun,
      memory: { store: this.store, savePolicy: "turn" },
      onActivity: activity && ((label) => activity(label)),
      send: async ({ to, text, quote, files }, { abortSignal }) => {
        if (files?.length) throw new Error(`${NO_COMPUTER}, so it cannot send a file`);

        if (to !== USER_HANDLE) {
          const sent = await this.bots.deliver({
            userId,
            from: bot,
            hops,
            handle: to,
            text,
            relaysPersonsWord: bot.isMain && onPersonsWord,
          });
          return `Sent to ${sent.name} (${sent.handle}).`;
        }

        await this.wait(typingDelay(text), abortSignal);
        say(text, quote);
        return "Sent to the person.";
      },
      react: async ({ messageId, emoji }) => {
        react(messageId, emoji);
        return `Reacted to ${messageId} with ${emoji}.`;
      },
      askQuestion: async (questions) => (ask(questions), {}),
    });
    await agent.generate({
      prompt: asked,
      session: { sessionId: bot.id, userId },
      abortSignal: signal,
    });
  }

  async #peers(userId: string, selfId: string) {
    const listed = await this.bots.list(userId);
    return listed.flatMap(({ id, handle, name, description }) =>
      id === selfId ? [] : [{ handle, name, description }],
    );
  }
}

function held(file: RunAttachment) {
  const kept = {
    name: file.name,
    mediaType: file.mediaType,
    size: file.size,
    path: file.name,
  };

  if (!file.image) return kept;

  return { ...kept, image: file.image };
}

function imagesOf(attachments: RunAttachment[] | undefined) {
  return new Map(
    (attachments ?? []).flatMap(({ image, data }) => (image ? [[image, data] as const] : [])),
  );
}

const pause: Wait = (ms, signal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error("The reply was cancelled"));
      return;
    }

    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(
          signal.reason instanceof Error ? signal.reason : new Error("The reply was cancelled"),
        );
      },
      { once: true },
    );
  });
