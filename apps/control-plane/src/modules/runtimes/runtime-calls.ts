import type { MemoryStore } from "@anvia/core";
import type {
  BotCreated,
  BotCreateParams,
  BotMemoryParams,
  BotUpdated,
  BotUpdateParams,
  CallMethod,
  RepoAccess,
  RunThreadInfo,
} from "@aven/protocol/runtime-wire";

import {
  parseAppendParams,
  parseBotCreateParams,
  parseBotMemoryParams,
  parseBotUpdateParams,
  parseMemoryParams,
  parseSkillsGetParams,
} from "./wire";

/** What answering a runtime's call needs to know of the run it names. */
export type CallRun = {
  thread: RunThreadInfo;
  /** The turns of the transcript already stored, so a call sent again after a dropped reply adds nothing. */
  appended: Set<number>;
  /** The digests of the run's skills. */
  skills: Set<string>;
};

/** What answering a runner's call about a bot's conversation needs of the reply it names. */
export type CallBotReply = {
  /** Answers for the reply's own bot and for no other. */
  memory(params: BotMemoryParams): Promise<unknown>;
  /** Makes a bot for the reply's owner, when the reply's bot may. */
  create(params: BotCreateParams): Promise<BotCreated>;
  /** Changes the reply's own bot, and no other. */
  update(params: BotUpdateParams): Promise<BotUpdated>;
};

export type RuntimeCallContext = {
  /** A live run of the connection the call came over. */
  findRun(runId: string): CallRun | undefined;
  /** A live bot reply of the connection the call came over. */
  findBotReply(replyId: string): CallBotReply | undefined;
  store: MemoryStore;
  repoAccess(threadId: string): Promise<RepoAccess>;
  skillArchive(digest: string): Promise<Uint8Array | undefined>;
};

// Every call names a run, which must be a live one of the connection it came over.
function liveRun(params: unknown, findRun: RuntimeCallContext["findRun"]) {
  const { runId } = parseMemoryParams(params);
  const run = findRun(runId);
  if (!run) throw new Error("Unknown or finished run");
  return { runId, run };
}

// A call about a bot, for the live reply it names: what the reply's own sink does, and never a bot
// or a person the runner names (decisions 0059, 0060 and 0061).
function answerBotCall<Params extends { replyId: string }, Result>(
  params: unknown,
  parse: (params: unknown) => Params,
  findBotReply: RuntimeCallContext["findBotReply"],
  act: (reply: CallBotReply, call: Params) => Promise<Result>,
) {
  const call = parse(params);
  const reply = findBotReply(call.replyId);
  if (!reply) throw new Error("Unknown or finished reply");
  return act(reply, call);
}

// Answers what a runtime asks of the control plane: to add a turn to the transcript, which the control plane
// owns, how to clone the repository, and the run's skills. All only for the run's own thread; the scope comes from
// our record of the run, never from what the runtime sends.
export async function answerRuntimeCall(
  method: CallMethod,
  params: unknown,
  { findRun, findBotReply, store, repoAccess, skillArchive }: RuntimeCallContext,
) {
  if (method === "bot.memory") {
    return answerBotCall(params, parseBotMemoryParams, findBotReply, (reply, call) =>
      reply.memory(call),
    );
  }
  if (method === "bot.create") {
    return answerBotCall(params, parseBotCreateParams, findBotReply, (reply, call) =>
      reply.create(call),
    );
  }
  if (method === "bot.update") {
    return answerBotCall(params, parseBotUpdateParams, findBotReply, (reply, call) =>
      reply.update(call),
    );
  }
  const { runId, run } = liveRun(params, findRun);
  if (method === "repo.access") return repoAccess(run.thread.id);
  if (method === "skills.get") {
    // Only a skill the run was given, whatever digest the runtime asks for.
    const { digest } = parseSkillsGetParams(params);
    const archive = run.skills.has(digest) ? await skillArchive(digest) : undefined;
    if (!archive) throw new Error("This run has no such skill");
    return { data: archive.toBase64() };
  }
  if (method !== "memory.append") throw new Error(`Unknown call: ${method satisfies never}`);
  const scope = {
    sessionId: run.thread.id,
    metadata: { organizationId: run.thread.organizationId },
  };
  const { turn, messages } = parseAppendParams(params);
  // A runtime that did not hear the reply asks again.
  if (run.appended.has(turn)) return null;
  run.appended.add(turn);
  try {
    await store.append({ scope, runId, turn, messages });
  } catch (error) {
    run.appended.delete(turn);
    throw error;
  }
  return null;
}
