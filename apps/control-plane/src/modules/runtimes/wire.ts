import type { Message } from "@anvia/core";
import { botQuestionsSchema, toQuestions } from "@aven/agents/tools/ask-question";
import {
  GOAL_CHECK_MAX,
  GOAL_CHECKS_MAX,
  GOAL_MAX_ROUNDS,
  GOAL_OBJECTIVE_MAX,
  GOAL_REASON_MAX,
} from "@aven/protocol/goals";
import { MCP_LIMIT, MCP_MAX_HEADERS, MCP_TARGETS } from "@aven/protocol/mcp";
import { SCHEDULE_NAME_MAX, SCHEDULE_PROMPT_MAX } from "@aven/protocol/schedules";
import { BOT_THREAD_PROMPT_MAX } from "@aven/protocol/threads";
import {
  BOT_DESCRIPTION_MAX,
  BOT_INSTRUCTION_MAX,
  BOT_MESSAGE_MAX,
  BOT_NAME_MAX,
} from "@aven/protocol/bots";
import {
  ARTIFACT_MEDIA_TYPES,
  ARTIFACT_NAME,
  SKILL_DIGEST,
  type BotQuestionParams,
  type BotGoalParams,
  type BotScheduleParams,
  type BotSendParams,
  type BotCreateParams,
  type BotMcpParams,
  type BotProviderParams,
  type BotThreadParams,
  type BotMemoryParams,
  type BotSkillParams,
  type BotUpdateParams,
  type CallMethod,
  PROVIDERS,
  type RunOutcome,
  type RuntimeToControlPlane,
} from "@aven/protocol/runtime-wire";
import { z } from "zod";

import { mcpHeaderName, mcpHeaderValue, mcpName, mcpUrl } from "../mcp/schema";
import { providerBaseUrl, providerModelId, providerName } from "../providers/schema";

// A runtime is not trusted, so every frame it sends is checked before anything acts on it.
// `@aven/protocol` has the types and no runtime imports; the checking lives here.

const runId = z.string().min(1);
const replyId = z.string().min(1);

// Listed by hand, since the protocol has only types; `satisfies` keeps each name one it knows.
const outcomes = [
  "response",
  "blocked",
  "interaction",
  "error",
] as const satisfies readonly RunOutcome[];
const callMethods = [
  "memory.append",
  "repo.access",
  "skills.get",
  "mcp.report",
  "bot.memory",
  "bot.create",
  "bot.update",
  "bot.send",
  "bot.question",
  "bot.schedule",
  "bot.goal",
  "bot.skill",
  "bot.mcp",
  "bot.provider",
  "bot.thread",
] as const satisfies readonly CallMethod[];

// A bot's message is at most what `send_message` takes; a runner cannot say more than the bot may.
const BOT_SAY_MAX = 2000;

// An image the agent showed: a name the runner gave it, so a client can only ask for it by that.
const toolImage = z.object({
  name: z.string().regex(ARTIFACT_NAME),
  mediaType: z.enum(ARTIFACT_MEDIA_TYPES),
  caption: z.string().max(500).optional(),
});

// The events a runtime's agent projects. Anything else (a snapshot, `done`) is the control plane's
// to send, so a runtime cannot forge a client's view of the conversation beyond its own run.
// What a subagent's tool call shows: the call and what it acts on, no output.
const subagentTool = z.object({
  id: z.string(),
  name: z.string(),
  target: z.string(),
  status: z.enum(["running", "done", "error"]),
});

const subagentPart = z.object({
  index: z.number().int().nonnegative(),
  description: z.string(),
  type: z.string(),
  status: z.enum(["running", "done", "error"]),
  tools: z.array(subagentTool),
  output: z.string().optional(),
});

const toolPart = z.object({
  id: z.string(),
  name: z.string(),
  target: z.string(),
  status: z.enum(["running", "done", "error"]),
  diff: z.array(z.object({ type: z.enum(["add", "del", "ctx"]), text: z.string() })).optional(),
  output: z.string().optional(),
  questions: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        choices: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
        allowCustom: z.boolean().optional(),
      }),
    )
    .optional(),
  image: toolImage.optional(),
  subagents: z.array(subagentPart).optional(),
});

const tokenCount = z.number().int().nonnegative();
const seq = z.number().int().positive();

const runEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), delta: z.string() }),
  // The agent took a message the person sent while it worked; the control plane has the words (decision 0098).
  z.object({ type: z.literal("steer_applied"), id: z.string().min(1).max(100) }),
  z.object({ type: z.literal("tool_start"), tool: toolPart }),
  z.object({
    type: z.literal("tool_end"),
    id: z.string(),
    status: z.enum(["done", "error"]),
    output: z.string().optional(),
    image: toolImage.optional(),
  }),
  z.object({
    type: z.literal("subagent"),
    index: z.number().int().nonnegative(),
    event: z.discriminatedUnion("type", [
      z.object({ type: z.literal("tool_start"), tool: subagentTool }),
      z.object({
        type: z.literal("tool_end"),
        id: z.string(),
        status: z.enum(["done", "error"]),
      }),
      z.object({
        type: z.literal("end"),
        status: z.enum(["done", "error"]),
        output: z.string().optional(),
      }),
    ]),
  }),
  z.object({
    type: z.literal("usage"),
    turn: z.object({
      inputTokens: tokenCount,
      outputTokens: tokenCount,
      cacheWriteTokens: tokenCount,
      cacheReadTokens: tokenCount,
    }),
    context: z
      .object({ usedTokens: tokenCount, contextWindow: z.number().int().positive() })
      .optional(),
  }),
]);

// A machine's load as a runner measured it (decision 0091). The numbers are the runner's to report;
// they are bounded here so a client never has to draw something absurd.
const bytes = z
  .number()
  .int()
  .nonnegative()
  .max(2 ** 50);
const hostStats = z
  .object({
    cores: z.number().int().min(1).max(4096),
    cpuPercent: z.number().min(0).max(100).nullable(),
    memoryUsedBytes: bytes,
    memoryTotalBytes: bytes,
    diskUsedBytes: bytes,
    diskTotalBytes: bytes,
    sandboxes: z.number().int().nonnegative().max(100_000),
  })
  // More used than there is would only be drawn as a figure past full.
  .refine(
    (stats) =>
      stats.memoryUsedBytes <= stats.memoryTotalBytes &&
      stats.diskUsedBytes <= stats.diskTotalBytes,
    "used is more than the total",
  );

const frame = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    version: z.number(),
    runs: z.array(runId).default([]),
    build: z.string().max(64).optional(),
  }),
  z.object({ type: z.literal("host.stats"), stats: hostStats }),
  z.object({ type: z.literal("run.event"), runId, seq, event: runEvent }),
  z.object({
    type: z.literal("run.end"),
    runId,
    seq,
    outcome: z.enum(outcomes),
    error: z.string().optional(),
    continuation: z.unknown().optional(),
  }),
  z.object({
    type: z.literal("bot.say"),
    replyId: z.string().min(1),
    text: z.string().min(1).max(BOT_SAY_MAX),
  }),
  z.object({
    type: z.literal("bot.end"),
    replyId: z.string().min(1),
    error: z.string().optional(),
  }),
  z.object({ type: z.literal("desktop.opened"), viewerId: z.string().min(1) }),
  z.object({
    type: z.literal("desktop.closed"),
    viewerId: z.string().min(1),
    reason: z.string(),
  }),
  z.object({ type: z.literal("terminal.opened"), viewerId: z.string().min(1) }),
  z.object({
    type: z.literal("terminal.closed"),
    viewerId: z.string().min(1),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("call"),
    id: z.string().min(1),
    method: z.enum(callMethods),
    params: z.unknown().optional(),
  }),
  z.object({ type: z.literal("reply"), id: z.string() }).loose(),
]);

// Fails to compile when a checked frame is not the protocol's. A reply is checked only for its id,
// the rest is read where it is answered, so it is left out; a call may leave out its `params`.
type Assignable<T extends U, U> = T;
type ParamsOptional<T> = T extends { type: "call" } ? Omit<T, "params"> & { params?: unknown } : T;
type _CheckedFrame = Assignable<
  Exclude<z.infer<typeof frame>, { type: "reply" }>,
  ParamsOptional<RuntimeToControlPlane>
>;

/** The frame a runtime sent, or null when it is not JSON or not a frame we know. */
export function parseRuntimeFrame(raw: string): RuntimeToControlPlane | null {
  try {
    const parsed = frame.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as RuntimeToControlPlane) : null;
  } catch {
    return null;
  }
}

const memoryParams = z.object({ runId });

const anvia = z.custom<object>((value) => typeof value === "object" && value !== null);

const botMemoryParams = z.discriminatedUnion("op", [
  z.object({ replyId, op: z.literal("load") }),
  z.object({
    replyId,
    op: z.literal("append"),
    runId,
    turn: z.number().int().nonnegative(),
    messages: z.array(anvia),
  }),
  z.object({ replyId, op: z.literal("snapshot") }),
  z.object({
    replyId,
    op: z.literal("replacePrefix"),
    runId,
    revision: z.string(),
    messageCount: z.number().int().nonnegative(),
    replacement: anvia,
  }),
]);

// The same limits as a person changing the bot in settings.
const botCreateParams = z.object({
  replyId,
  name: z.string().trim().min(1).max(BOT_NAME_MAX),
  instruction: z.string().trim().min(1).max(BOT_INSTRUCTION_MAX),
  description: z.string().trim().max(BOT_DESCRIPTION_MAX).optional(),
});

// A bot asks the person to decide, with the questions the tool takes.
const botQuestionParams = z.object({
  replyId,
  questions: botQuestionsSchema.transform(toQuestions),
});

// A bot looks at its schedules, or makes, changes or deletes one. How it is for the cron to be
// right, and the timezone, is for the schedules to say: here it is only shaped.
const scheduleName = z.string().trim().min(1).max(SCHEDULE_NAME_MAX);
const scheduleCron = z.string().trim().min(1).max(100);
const scheduleTimezone = z.string().trim().min(1).max(64);
const schedulePrompt = z.string().trim().min(1).max(SCHEDULE_PROMPT_MAX);
const scheduleBot = z.string().trim().min(1).max(64);
const scheduleId = z.uuid();
const botScheduleParams = z.discriminatedUnion("op", [
  z.object({ replyId, op: z.literal("list") }),
  z.object({
    replyId,
    op: z.literal("create"),
    name: scheduleName,
    cron: scheduleCron,
    prompt: schedulePrompt,
    timezone: scheduleTimezone.optional(),
    bot: scheduleBot.optional(),
  }),
  z.object({
    replyId,
    op: z.literal("update"),
    id: scheduleId,
    name: scheduleName.optional(),
    cron: scheduleCron.optional(),
    prompt: schedulePrompt.optional(),
    timezone: scheduleTimezone.optional(),
    enabled: z.boolean().optional(),
    bot: scheduleBot.optional(),
  }),
  z.object({ replyId, op: z.literal("delete"), id: scheduleId }),
]);

// A bot looks at its goal, starts one or changes it. The goal is the reply's own bot's.
const botGoalParams = z.discriminatedUnion("op", [
  z.object({ replyId, op: z.literal("get") }),
  z.object({
    replyId,
    op: z.literal("start"),
    objective: z.string().trim().min(1).max(GOAL_OBJECTIVE_MAX),
    checks: z.array(z.string().trim().min(1).max(GOAL_CHECK_MAX)).max(GOAL_CHECKS_MAX),
    maxRounds: z.number().int().min(1).max(GOAL_MAX_ROUNDS).optional(),
  }),
  z.object({
    replyId,
    op: z.literal("update"),
    action: z.enum(["complete", "blocked", "pause", "resume", "clear"]),
    reason: z.string().trim().max(GOAL_REASON_MAX).optional(),
  }),
]);

// A bot writes to another of the person's bots, named by its handle.
const botSendParams = z.object({
  replyId,
  to: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/)
    .max(64),
  text: z.string().trim().min(1).max(BOT_MESSAGE_MAX),
});

// What a bot changes about itself: some of its name, description and instruction, never nothing.
const botUpdateParams = z
  .object({
    replyId,
    name: z.string().trim().min(1).max(BOT_NAME_MAX).optional(),
    description: z.string().trim().max(BOT_DESCRIPTION_MAX).optional(),
    instruction: z.string().trim().max(BOT_INSTRUCTION_MAX).optional(),
  })
  .refine(
    ({ name, description, instruction }) =>
      [name, description, instruction].some((value) => value !== undefined),
    { message: "Nothing to change" },
  );

const appendParams = memoryParams.extend({
  turn: z.number().int().nonnegative(),
  messages: z.array(z.custom<Message>((value) => typeof value === "object" && value !== null)),
});

const skillsGetParams = memoryParams.extend({ digest: z.string().regex(SKILL_DIGEST) });

// How the run's MCP servers connected: a reason is a line a person reads in Settings, so it is cut.
const mcpReportParams = memoryParams.extend({
  results: z
    .array(z.object({ id: z.uuid(), error: z.string().trim().max(500).optional() }))
    .max(MCP_LIMIT),
});

// A bot's look at the person's MCP servers, or its change to one (decision 0085): what it may say is
// what the person's own form takes, less what a bot may not set.
const botMcpHeaders = z
  .array(z.object({ name: mcpHeaderName, value: mcpHeaderValue }))
  .max(MCP_MAX_HEADERS)
  .refine(
    (headers) =>
      new Set(headers.map((header) => header.name.toLowerCase())).size === headers.length,
    "A header is given once",
  );
const botMcpParams = z.discriminatedUnion("op", [
  z.object({ replyId, op: z.literal("list") }),
  z.object({
    replyId,
    op: z.literal("add"),
    name: mcpName,
    url: mcpUrl,
    headers: botMcpHeaders.optional(),
    target: z.enum(MCP_TARGETS).optional(),
  }),
  z.object({
    replyId,
    op: z.literal("update"),
    id: z.uuid(),
    name: mcpName.optional(),
    url: mcpUrl.optional(),
    headers: botMcpHeaders.optional(),
    target: z.enum(MCP_TARGETS).optional(),
    enabled: z.boolean().optional(),
  }),
  z.object({ replyId, op: z.literal("remove"), id: z.uuid() }),
  z.object({
    replyId,
    op: z.literal("report"),
    results: z
      .array(z.object({ id: z.uuid(), error: z.string().trim().max(500).optional() }))
      .max(MCP_LIMIT),
  }),
]);

// A bot's look at the person's providers, or its change to one (decision 0086): shaped here, and
// held to each kind's own rules by the providers. There is no key in any of it.
const botProviderParams = z.discriminatedUnion("op", [
  z.object({ replyId, op: z.literal("list") }),
  z.object({
    replyId,
    op: z.literal("add"),
    kind: z.enum(PROVIDERS),
    name: providerName,
    baseUrl: z.string().max(500).optional(),
    modelId: providerModelId.optional(),
    isDefault: z.boolean().optional(),
  }),
  z.object({
    replyId,
    op: z.literal("update"),
    id: z.uuid(),
    name: providerName.optional(),
    baseUrl: providerBaseUrl.optional(),
    modelId: providerModelId.optional(),
    isDefault: z.literal(true).optional(),
  }),
  z.object({ replyId, op: z.literal("remove"), id: z.uuid() }),
  z.object({ replyId, op: z.literal("models"), id: z.uuid() }),
  z.object({ replyId, op: z.literal("askKey"), id: z.uuid() }),
]);

// A bot's look at the person's threads, or what it does to one (decision 0088): shaped here, the
// prompt held to what a person's own message may be, and the rest to the threads' own rules.
const threadPrompt = z.string().trim().min(1).max(BOT_THREAD_PROMPT_MAX);
const threadModel = {
  providerId: z.uuid().optional(),
  modelId: z.string().trim().min(1).max(200).optional(),
  reasoningEffort: z.string().trim().min(1).max(20).optional(),
};
const botThreadParams = z.discriminatedUnion("op", [
  z.object({ replyId, op: z.literal("projects") }),
  z.object({
    replyId,
    op: z.literal("list"),
    projectId: z.uuid().optional(),
    archived: z.boolean().optional(),
  }),
  z.object({ replyId, op: z.literal("get"), id: z.uuid() }),
  z.object({
    replyId,
    op: z.literal("start"),
    projectId: z.uuid(),
    prompt: threadPrompt,
    title: z.string().trim().min(1).max(200).optional(),
    ...threadModel,
  }),
  z.object({
    replyId,
    op: z.literal("continue"),
    id: z.uuid(),
    prompt: threadPrompt,
    ...threadModel,
  }),
  z.object({
    replyId,
    op: z.literal("archive"),
    id: z.uuid(),
    archived: z.boolean().optional(),
  }),
]);

// A skill of a bot's reply, by its digest.
const botSkillParams = z.object({ replyId, digest: z.string().regex(SKILL_DIGEST) });

function parseParams<T>(schema: z.ZodType<T>, params: unknown) {
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    // Said in words, since the runner's agent reads it and must know what to change.
    const issue = parsed.error.issues[0]!;
    throw new Error(`Invalid parameters: ${issue.path.join(".") || "params"} ${issue.message}`);
  }
  return parsed.data;
}

export const parseBotMemoryParams = (params: unknown) =>
  parseParams(botMemoryParams, params) as BotMemoryParams;
export const parseBotCreateParams = (params: unknown) =>
  parseParams(botCreateParams, params) as BotCreateParams;
export const parseBotQuestionParams = (params: unknown) =>
  parseParams(botQuestionParams, params) as BotQuestionParams;
export const parseBotScheduleParams = (params: unknown) =>
  parseParams(botScheduleParams, params) as BotScheduleParams;
export const parseBotGoalParams = (params: unknown) =>
  parseParams(botGoalParams, params) as BotGoalParams;
export const parseBotSendParams = (params: unknown) =>
  parseParams(botSendParams, params) as BotSendParams;
export const parseBotUpdateParams = (params: unknown) =>
  parseParams(botUpdateParams, params) as BotUpdateParams;
export const parseBotMcpParams = (params: unknown) =>
  parseParams(botMcpParams, params) as BotMcpParams;
export const parseBotProviderParams = (params: unknown) =>
  parseParams(botProviderParams, params) as BotProviderParams;
export const parseBotThreadParams = (params: unknown) =>
  parseParams(botThreadParams, params) as BotThreadParams;
export const parseBotSkillParams = (params: unknown) =>
  parseParams(botSkillParams, params) as BotSkillParams;
export const parseMemoryParams = (params: unknown) => parseParams(memoryParams, params);
export const parseAppendParams = (params: unknown) => parseParams(appendParams, params);
export const parseSkillsGetParams = (params: unknown) => parseParams(skillsGetParams, params);
export const parseMcpReportParams = (params: unknown) => parseParams(mcpReportParams, params);
