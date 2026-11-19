import type { MemoryStore } from "@anvia/core";
import { sentPrompt } from "@aven/agents/attachments";
import { createBotAgent } from "@aven/agents/bot-agent";
import { typingDelay } from "@aven/agents/bot-delay";
import { USER_HANDLE } from "@aven/protocol/bots";
import { UnavailableError } from "@aven/server-kit/errors";

import { lensSettingsService } from "../lens/service";
import { webSearchForRun } from "../runs/web-search";
import { replyHosts } from "./reply-hosts";
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
import type { Bot, BotPeer, RunAttachment } from "@aven/protocol/types";

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
    const {
      bot,
      userId,
      prompt,
      attachments,
      hops,
      onPersonsWord,
      aboutThread,
      say,
      ask,
      react,
      activity,
      signal,
    } = input;
    signal.throwIfAborted();
    const { store, bots, world, notes } = this.options;
    const peers = await this.#peers(userId, bot.id);
    const brief = await world.forReply(userId);
    const memoryOwner = {
      userId,
      botId: bot.id,
      readProjects: brief.projects.map(({ id, slug }) => ({ id, slug })),
    };
    await notes
      .keepDigest(userId, bot.id)
      .catch((error: unknown) =>
        console.warn(`Could not keep the activity digest of bot ${bot.id}:`, error),
      );
    const folders = await notes.folders(memoryOwner);
    const timezone = await bots.timezone(userId);
    signal.throwIfAborted();
    const hosts = replyHosts({
      bot,
      userId,
      prompt,
      hops,
      onPersonsWord,
      aboutThread,
      memoryOwner,
      ask,
      bots,
      mcp: this.options.mcp,
      providers: this.options.providers,
      threads: this.options.threads,
      notes,
      world,
    });
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
      context: brief.context,
      projects: brief.projects,
      projectFiles: hosts.projectFiles,
      webSearch: webSearchForRun,
      lens: await lensSettingsService.forRun(),
      memory: { store, savePolicy: "turn" },
      onActivity: activity && ((label) => activity(label)),
      send: async ({ to, text, quote, files }, { abortSignal }) => {
        if (files?.length) throw new Error(`${NO_COMPUTER}, so it cannot send a file`);

        if (to !== USER_HANDLE) {
          const sent = await bots.deliver({
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
      askQuestion: async (questions) => {
        if (hosts.asked())
          throw new Error("You have already asked. Stop now and wait for the answer.");

        hosts.takeAsked();
        ask(questions);
        return {};
      },
      createBot: bot.isMain
        ? async (input) => {
            const created = await hosts.createBot(input);
            peers.push({
              handle: created.handle,
              name: created.name,
              description: input.description ?? "",
            });
            return created;
          }
        : undefined,
      deleteBot: bot.isMain
        ? async (input) => {
            const deleted = await hosts.deleteBot(input);
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

  async #peers(userId: string, selfId: string): Promise<BotPeer[]> {
    const listed = await this.options.bots.list(userId);
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
