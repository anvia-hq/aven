import { runCockpitCommand } from "../cockpit/commands";
import { runMemoryCommand } from "../memory/commands";
import { explainMachineCallError } from "./machine-call-error";
import {
  parseAppendParams,
  parseBotNotesParams,
  parseMemoryNotesParams,
  parseBotCreateParams,
  parseBotDeleteParams,
  parseBotGoalParams,
  parseBotMcpParams,
  parseBotProviderParams,
  parseBotApiParams,
  parseBotThreadParams,
  parseBotMemoryParams,
  parseBotQuestionParams,
  parseBotReactParams,
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
  parseMachineRelayParams,
  parseSkillsGetParams,
} from "@aven/protocol/wire";
import type { CallBotReply, RuntimeCallContext } from "./types";
import type { CallMethod } from "@aven/protocol/types";

const MACHINE_CALL_TIMEOUT_MS = 5 * 60_000;
const MACHINE_CALL_MARGIN_MS = 30_000;

function machineCallTimeout(args: unknown) {
  const asked = (args as { timeoutMs?: unknown } | undefined)?.timeoutMs;
  return typeof asked === "number" && asked > 0
    ? asked + MACHINE_CALL_MARGIN_MS
    : MACHINE_CALL_TIMEOUT_MS;
}

async function answerMachineCall(
  params: unknown,
  findRun: RuntimeCallContext["findRun"],
  findBotReply: RuntimeCallContext["findBotReply"],
  machines: RuntimeCallContext["machines"],
) {
  const relay = parseMachineRelayParams(params);
  const place =
    "replyId" in relay ? replyPlace(relay.replyId, findBotReply) : runPlace(params, findRun);
  const machine = await machines.reach(place);
  return machine
    .call(
      "machine.call",
      { threadId: place.threadId, op: relay.op, args: relay.args },
      machineCallTimeout(relay.args),
    )
    .catch(explainMachineCallError);
}

function replyPlace(replyId: string, findBotReply: RuntimeCallContext["findBotReply"]) {
  const reply = findBotReply(replyId);

  if (!reply) throw new Error("Unknown or finished reply");

  if (!reply.machine || !reply.botId) throw new Error("This reply's tools act on its own runner");

  return { runtimeId: reply.machine, threadId: reply.botId };
}

function runPlace(params: unknown, findRun: RuntimeCallContext["findRun"]) {
  const { run } = liveRun(params, findRun);

  if (!run.thread.machine) throw new Error("This run's tools act on its own runner");

  return { runtimeId: run.thread.machine, threadId: run.thread.id };
}

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
  {
    findRun,
    findBotReply,
    store,
    repoAccess,
    folderOf,
    skillArchive,
    mcpReport,
    forks,
    machines,
  }: RuntimeCallContext,
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

  if (method === "bot.delete") {
    return answerBotCall(params, parseBotDeleteParams, findBotReply, (reply, call) =>
      reply.delete(call),
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

  if (method === "bot.react") {
    return answerBotCall(params, parseBotReactParams, findBotReply, async (reply, call) =>
      reply.react(call),
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

  if (method === "bot.api") {
    return answerBotCall(params, parseBotApiParams, findBotReply, (reply, call) => reply.api(call));
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

  if (method === "machine.call") return answerMachineCall(params, findRun, findBotReply, machines);

  const { runId, run } = liveRun(params, findRun);

  if (method === "repo.access") return repoAccess(run.thread.id);

  if (method === "repo.folder") return { directory: await folderOf(run.thread.id) };

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

  if (method === "fork.status") {
    const { id, stop } = parseForkStatusParams(params);
    return forks.status(run.thread, id, stop);
  }

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
