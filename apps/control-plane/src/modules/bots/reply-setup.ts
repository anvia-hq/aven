import { BOT_MESSAGE_MAX, BOT_MESSAGES_PER_REPLY, parseBotPrompt } from "@aven/protocol/bots";
import type { Bot, BotPeer, BotQuestion, BotQuestioned } from "@aven/protocol/types";
import { describeError } from "@aven/server-kit/errors";

import type { BotMcp } from "../mcp/types";
import type { BotProviders } from "../providers/types";
import type { BotThreads } from "../threads/types";
import { replyHosts } from "./reply-hosts";
import type { BotMemoryNotes, BotReplyBots, BotReplyInput, BotWorldKeeper } from "./types";

export function replyAbortError(signal?: AbortSignal) {
  return signal?.reason instanceof Error ? signal.reason : new Error("The reply was cancelled");
}

function relayedQuestion(bot: Bot, questions: readonly BotQuestion[]) {
  const line = (text: string) => text.replace(/\s+/g, " ").trim();
  const asked = questions
    .map((question) => {
      const choices = question.choices?.map((choice) => line(choice.label)).join(", ");
      return `- id "${line(question.id)}": ${line(question.text)}${choices ? ` (choices: ${choices})` : ""}`;
    })
    .join("\n");
  const text = `${line(bot.name)} (${bot.handle}) needs a decision from the person to go on. Ask the person with ask_question, offering the same choices, and when they answer, send it to ${bot.handle} with send_message. The questions:\n${asked}`;
  return text.slice(0, BOT_MESSAGE_MAX);
}

async function peersOf(bots: BotReplyBots, userId: string, selfId: string): Promise<BotPeer[]> {
  const listed = await bots.list(userId);
  return listed.flatMap(({ id, handle, name, description }) =>
    id === selfId ? [] : [{ handle, name, description }],
  );
}

export async function prepareBotReply(
  input: Pick<
    BotReplyInput,
    "bot" | "userId" | "prompt" | "hops" | "onPersonsWord" | "aboutThread" | "ask" | "signal"
  >,
  deps: {
    bots: BotReplyBots;
    mcp: BotMcp;
    providers: BotProviders;
    threads: BotThreads;
    notes: BotMemoryNotes;
    world: BotWorldKeeper;
  },
) {
  const { bot, userId, prompt, hops, onPersonsWord, aboutThread, ask, signal } = input;
  const { bots, mcp, providers, threads, notes, world: worldKeeper } = deps;
  const peers = await peersOf(bots, userId, bot.id);
  const timezone = await bots.timezone(userId);
  const world = await worldKeeper.forReply(userId);
  const memoryOwner = {
    userId,
    botId: bot.id,
    readProjects: world.projects.map(({ id, slug }) => ({ id, slug })),
  };
  await notes
    .keepDigest(userId, bot.id)
    .catch((error: unknown) =>
      console.warn(`Could not keep the activity digest of bot ${bot.id}:`, describeError(error)),
    );
  const folders = await notes.folders(memoryOwner);
  signal.throwIfAborted();

  const { from, note } = parseBotPrompt(prompt);
  const makesBotsOnTheirWord = onPersonsWord && from === undefined;
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
    mcp,
    providers,
    threads,
    notes,
    world: worldKeeper,
  });

  let written = 0;
  const sendToBot = async (to: string, text: string) => {
    if (written >= BOT_MESSAGES_PER_REPLY) {
      throw new Error(
        `You have written to bots ${BOT_MESSAGES_PER_REPLY} times in this reply. Tell the person instead.`,
      );
    }

    written += 1;
    return bots.deliver({
      userId,
      from: bot,
      hops,
      handle: to,
      text,
      relaysPersonsWord: bot.isMain && onPersonsWord,
    });
  };

  const askQuestion = async (questions: BotQuestion[]): Promise<BotQuestioned> => {
    if (note) throw new Error("Nobody is there to answer: this was not the person's message");

    if (hosts.asked()) throw new Error("You have already asked. Stop now and wait for the answer.");

    hosts.takeAsked();

    if (bot.isMain || from === undefined) {
      ask(questions);
      return {};
    }

    const main = (await bots.list(userId)).find((other) => other.isMain);

    if (!main) throw new Error("There is no main bot to ask the person");

    const text = relayedQuestion(bot, questions);
    const sent = await sendToBot(main.handle, text);
    return { relayed: { handle: sent.handle, name: sent.name, text } };
  };

  return {
    peers,
    timezone,
    world,
    folders,
    hosts,
    sendToBot,
    askQuestion,
    makesBotsOnTheirWord,
  };
}
