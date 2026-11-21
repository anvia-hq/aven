import type { MemoryStore } from "@anvia/core";
import { sentPrompt } from "@aven/agents/attachments";
import { createBotAgent } from "@aven/agents/bot-agent";
import { typingDelay } from "@aven/agents/bot-delay";
import { USER_HANDLE } from "@aven/protocol/bots";
import { UnavailableError } from "@aven/server-kit/errors";

import { lensSettingsService } from "../lens/service";
import { webSearchForRun } from "../runs/web-search";
import { prepareBotReply, replyAbortError } from "./reply-setup";
import type {
  BotMemoryNotes,
  BotReplyBots,
  BotReplier,
  BotReplyInput,
  BotWorldKeeper,
} from "./types";
import type { BotMcp } from "../mcp/types";
import type { BotProviders, BotRunChoice } from "../providers/types";
import type { BotThreads } from "../threads/types";
import type { ModelConfig } from "@aven/agents/types";
import type { Bot, RunAttachment } from "@aven/protocol/types";

export const NO_COMPUTER = "This bot has no computer";

type Wait = (ms: number, signal?: AbortSignal) => Promise<void>;

export type TalkBotOptions = {
  store: MemoryStore;
  bots: BotReplyBots;
  world: BotWorldKeeper;
  mcp: BotMcp;
  providers: BotProviders;
  threads: BotThreads;
  notes: BotMemoryNotes;
};

export class TalkBotReplier implements BotReplier {
  constructor(
    private options: TalkBotOptions,
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
    const { bot, userId, prompt, attachments, onPersonsWord, say, react, activity, signal } = input;
    signal.throwIfAborted();
    const { store } = this.options;
    const { peers, timezone, world, folders, hosts, sendToBot, askQuestion } =
      await prepareBotReply(input, this.options);
    const asked = sentPrompt(prompt, {
      attachments: (attachments ?? []).map(held),
      images: imagesOf(attachments),
    });
    const agent = this.agent({
      ...model,
      id: bot.id,
      name: bot.name,
      handle: bot.handle,
      timezone,
      instruction: bot.instruction,
      description: bot.description,
      compactAfterTokens: bot.compactAfterTokens ?? undefined,
      peers,
      context: world.context,
      projects: world.projects,
      projectFiles: hosts.projectFiles,
      webSearch: webSearchForRun,
      lens: await lensSettingsService.forRun(),
      memory: { store, savePolicy: "turn" },
      onActivity: activity && ((label) => activity(label)),
      send: async ({ to, text, quote, files }, { abortSignal }) => {
        if (files?.length) throw new Error(`${NO_COMPUTER}, so it cannot send a file`);

        if (to !== USER_HANDLE) {
          const sent = await sendToBot(to, text);
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
      askQuestion,
      createBot: bot.isMain
        ? async (createdInput) => {
            const created = await hosts.createBot(createdInput);
            peers.push({
              handle: created.handle,
              name: created.name,
              description: createdInput.description ?? "",
            });
            return created;
          }
        : undefined,
      deleteBot: bot.isMain
        ? async (deleteInput) => {
            const deleted = await hosts.deleteBot(deleteInput);
            const at = peers.findIndex((peer) => peer.handle === deleted.handle);

            if (at >= 0) peers.splice(at, 1);

            return deleted;
          }
        : undefined,
      updateSelf: hosts.updateSelf,
      schedules: hosts.schedules,
      mcpServers: hosts.mcpServers,
      providers: hosts.providers,
      threads: hosts.threads,
      api: hosts.api,
      notes: { memory: { folders, writable: onPersonsWord }, host: hosts.notes },
      cockpit: { access: "write", host: hosts.cockpit },
    });
    await agent.generate({
      prompt: asked,
      session: { sessionId: bot.id, userId },
      abortSignal: signal,
    });
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
      reject(replyAbortError(signal));
      return;
    }

    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(replyAbortError(signal));
      },
      { once: true },
    );
  });
