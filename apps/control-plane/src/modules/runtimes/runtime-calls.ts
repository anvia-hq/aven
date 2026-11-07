import type { CallMethod } from "@aven/protocol/runtime-wire";

import { runCockpitCommand } from "../cockpit/commands";
import { runMemoryCommand } from "../memory/commands";
import {
  parseAppendParams,
  parseBotNotesParams,
  parseMemoryNotesParams,
  parseBotCreateParams,
  parseBotGoalParams,
  parseBotMcpParams,
  parseBotProviderParams,
  parseBotThreadParams,
  parseBotMemoryParams,
  parseBotQuestionParams,
  parseBotScheduleParams,
  parseBotSendParams,
  parseBotSkillParams,
  parseBotUpdateParams,
  parseMcpReportParams,
  parseMemoryParams,
  parseBotCockpitParams,
  parseCockpitReadParams,
  parseForkStartParams,
  parseForkStatusParams,
  parseSkillsGetParams,
} from "./wire";
import type { CallBotReply, RuntimeCallContext } from "./types";

function liveRun(params: unknown, findRun: RuntimeCallContext["findRun"]) {
  const { runId } = parseMemoryParams(params);
  const run = findRun(runId);
  if (!run) throw new Error("Unknown or finished run");
  return { runId, run };
}

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

export async function answerRuntimeCall(
  method: CallMethod,
  params: unknown,
  { findRun, findBotReply, store, repoAccess, skillArchive, mcpReport, forks }: RuntimeCallContext,
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
  if (method === "bot.schedule") {
    return answerBotCall(params, parseBotScheduleParams, findBotReply, (reply, call) =>
      reply.schedule(call),
    );
  }
  if (method === "bot.goal") {
    return answerBotCall(params, parseBotGoalParams, findBotReply, (reply, call) =>
      reply.goal(call),
    );
  }
  if (method === "bot.question") {
    return answerBotCall(params, parseBotQuestionParams, findBotReply, (reply, call) =>
      reply.question(call),
    );
  }
  if (method === "bot.send") {
    return answerBotCall(params, parseBotSendParams, findBotReply, (reply, call) =>
      reply.send(call),
    );
  }
  if (method === "bot.skill") {
    return answerBotCall(params, parseBotSkillParams, findBotReply, (reply, call) =>
      reply.skill(call),
    );
  }
  if (method === "bot.mcp") {
    return answerBotCall(params, parseBotMcpParams, findBotReply, (reply, call) => reply.mcp(call));
  }
  if (method === "bot.provider") {
    return answerBotCall(params, parseBotProviderParams, findBotReply, (reply, call) =>
      reply.provider(call),
    );
  }
  if (method === "bot.thread") {
    return answerBotCall(params, parseBotThreadParams, findBotReply, (reply, call) =>
      reply.thread(call),
    );
  }
  if (method === "bot.notes") {
    return answerBotCall(params, parseBotNotesParams, findBotReply, (reply, call) =>
      reply.notes(call),
    );
  }
  if (method === "bot.cockpit") {
    return answerBotCall(params, parseBotCockpitParams, findBotReply, (reply, call) =>
      reply.cockpit(call),
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
    const { digest } = parseSkillsGetParams(params);
    const archive = run.skills.has(digest) ? await skillArchive(digest) : undefined;
    if (!archive) throw new Error("This run has no such skill");
    return { data: archive.toBase64() };
  }
  if (method === "mcp.report") {
    const { results } = parseMcpReportParams(params);
    await mcpReport(results.filter((result) => run.mcp.has(result.id)));
    return null;
  }
  if (method === "memory.notes") {
    if (!run.memory) throw new Error("This run has no memory");
    return runMemoryCommand(run.memory, parseMemoryNotesParams(params).command);
  }
  if (method === "cockpit.read") {
    if (!run.cockpit) throw new Error("This run has no cockpit");
    return runCockpitCommand(run.cockpit, parseCockpitReadParams(params).command);
  }
  if (method === "fork.start") return forks.start(run.thread, parseForkStartParams(params));
  if (method === "fork.status") return forks.status(run.thread, parseForkStatusParams(params).id);
  if (method !== "memory.append") throw new Error(`Unknown call: ${method satisfies never}`);
  const scope = {
    sessionId: run.thread.id,
    metadata: { organizationId: run.thread.organizationId },
  };
  const { turn, messages } = parseAppendParams(params);
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
