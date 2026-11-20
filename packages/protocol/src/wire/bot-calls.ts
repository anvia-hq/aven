import { z } from "zod";

import { botQuestionsSchema, toQuestions } from "../ask-question";
import {
  BOT_DESCRIPTION_MAX,
  BOT_INSTRUCTION_MAX,
  BOT_MESSAGE_ID,
  BOT_MESSAGE_MAX,
  BOT_NAME_MAX,
  BOT_REACTION_MAX,
  isBotReaction,
} from "../bots";
import {
  GOAL_CHECK_MAX,
  GOAL_CHECKS_MAX,
  GOAL_MAX_ROUNDS,
  GOAL_OBJECTIVE_MAX,
  GOAL_REASON_MAX,
} from "../goals";
import { MCP_MAX_HEADERS, MCP_TARGETS } from "../mcp";
import { mcpHeaderName, mcpHeaderValue, mcpName, mcpUrl } from "../mcp-schema";
import { providerBaseUrl, providerModelId, providerName } from "../provider-schema";
import { PROVIDERS, SKILL_DIGEST } from "../runtime-wire";
import { SCHEDULE_NAME_MAX, SCHEDULE_PROMPT_MAX } from "../schedules";
import { BOT_THREAD_PROMPT_MAX, THREAD_TITLE_MAX } from "../threads";
import type {
  BotApiParams,
  BotCreateParams,
  BotDeleteParams,
  BotGoalParams,
  BotMcpParams,
  BotMemoryParams,
  BotNotesParams,
  BotProjectParams,
  BotProviderParams,
  BotQuestionParams,
  BotReactParams,
  BotScheduleParams,
  BotSendParams,
  BotSkillParams,
  BotThreadParams,
  BotUpdateParams,
} from "../types";
import { mcpConnectResults, memoryCommand, parseParams, replyId, runId } from "./shared";

const anvia = z.custom<object>((value) => typeof value === "object" && value !== null);

const botMemoryParams = z.discriminatedUnion("op", [
  z.object({ replyId, op: z.literal("load") }),
  z.object({
    replyId,
    op: z.literal("append"),
    runId,
    turn: z.int().nonnegative(),
    messages: z.array(anvia),
  }),
  z.object({ replyId, op: z.literal("snapshot") }),
  z.object({
    replyId,
    op: z.literal("replacePrefix"),
    runId,
    revision: z.string(),
    messageCount: z.int().nonnegative(),
    replacement: anvia,
  }),
]) satisfies z.ZodType<BotMemoryParams>;

const botCreateParams = z.object({
  replyId,
  name: z.string().trim().min(1).max(BOT_NAME_MAX),
  instruction: z.string().trim().min(1).max(BOT_INSTRUCTION_MAX),
  description: z.string().trim().max(BOT_DESCRIPTION_MAX).optional(),
}) satisfies z.ZodType<BotCreateParams>;

const botDeleteParams = z.object({
  replyId,
  handle: z.string().trim().min(1).max(64),
}) satisfies z.ZodType<BotDeleteParams>;

const botQuestionParams = z.object({
  replyId,
  questions: botQuestionsSchema.transform(toQuestions),
}) satisfies z.ZodType<BotQuestionParams>;

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
]) satisfies z.ZodType<BotScheduleParams>;

const botGoalParams = z.discriminatedUnion("op", [
  z.object({ replyId, op: z.literal("get") }),
  z.object({
    replyId,
    op: z.literal("start"),
    objective: z.string().trim().min(1).max(GOAL_OBJECTIVE_MAX),
    checks: z.array(z.string().trim().min(1).max(GOAL_CHECK_MAX)).max(GOAL_CHECKS_MAX),
    maxRounds: z.int().min(1).max(GOAL_MAX_ROUNDS).optional(),
  }),
  z.object({
    replyId,
    op: z.literal("update"),
    action: z.enum(["complete", "blocked", "pause", "resume", "clear"]),
    reason: z.string().trim().max(GOAL_REASON_MAX).optional(),
  }),
]) satisfies z.ZodType<BotGoalParams>;

const botSendParams = z.object({
  replyId,
  to: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/)
    .max(64),
  text: z.string().trim().min(1).max(BOT_MESSAGE_MAX),
}) satisfies z.ZodType<BotSendParams>;

const botReactParams = z.object({
  replyId,
  messageId: z.string().trim().regex(BOT_MESSAGE_ID),
  emoji: z.string().trim().min(1).max(BOT_REACTION_MAX).refine(isBotReaction, "One emoji"),
}) satisfies z.ZodType<BotReactParams>;

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
  ) satisfies z.ZodType<BotUpdateParams>;

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
    results: mcpConnectResults,
  }),
]) satisfies z.ZodType<BotMcpParams>;

const botProviderParams = z.discriminatedUnion("op", [
  z.object({ replyId, op: z.literal("list") }),
  z.object({
    replyId,
    op: z.literal("add"),
    kind: z.enum(PROVIDERS),
    name: providerName,
    baseUrl: providerBaseUrl.optional(),
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
]) satisfies z.ZodType<BotProviderParams>;

const threadPrompt = z.string().trim().min(1).max(BOT_THREAD_PROMPT_MAX);
const threadModel = {
  providerId: z.uuid().optional(),
  modelId: z.string().trim().min(1).max(200).optional(),
  reasoningEffort: z.string().trim().min(1).max(20).optional(),
};

const botNotesParams = z.object({
  replyId,
  command: memoryCommand,
}) satisfies z.ZodType<BotNotesParams>;

const botCockpitParams = z.object({ replyId, command: z.unknown() });

const botApiParams = z.discriminatedUnion("op", [
  z.object({ replyId, op: z.literal("search"), query: z.string().trim().max(200).optional() }),
  z.object({
    replyId,
    op: z.literal("call"),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    path: z.string().min(1).max(2000),
    body: z.unknown().optional(),
    organizationId: z.string().min(1).max(100).optional(),
    confirmed: z.boolean().optional(),
  }),
]) satisfies z.ZodType<BotApiParams>;

const botProjectParams = z.discriminatedUnion("op", [
  z.object({
    replyId,
    op: z.literal("folder"),
    projectId: z.uuid(),
    path: z.string().max(500).optional(),
  }),
  z.object({
    replyId,
    op: z.literal("file"),
    projectId: z.uuid(),
    path: z.string().min(1).max(500),
  }),
]) satisfies z.ZodType<BotProjectParams>;

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
    title: z.string().trim().min(1).max(THREAD_TITLE_MAX).optional(),
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
  z.object({ replyId, op: z.literal("stop"), id: z.uuid() }),
  z.object({
    replyId,
    op: z.literal("answer"),
    id: z.uuid(),
    answers: z
      .array(
        z.object({
          questionId: z.string().min(1).max(100),
          value: z.string().trim().min(1).max(2000),
        }),
      )
      .min(1)
      .max(4),
  }),
]) satisfies z.ZodType<BotThreadParams>;

const botSkillParams = z.object({
  replyId,
  digest: z.string().regex(SKILL_DIGEST),
}) satisfies z.ZodType<BotSkillParams>;

export const parseBotMemoryParams = (params: unknown): BotMemoryParams =>
  parseParams(botMemoryParams, params);
export const parseBotCreateParams = (params: unknown): BotCreateParams =>
  parseParams(botCreateParams, params);
export const parseBotDeleteParams = (params: unknown): BotDeleteParams =>
  parseParams(botDeleteParams, params);
export const parseBotQuestionParams = (params: unknown): BotQuestionParams =>
  parseParams(botQuestionParams, params);
export const parseBotScheduleParams = (params: unknown): BotScheduleParams =>
  parseParams(botScheduleParams, params);
export const parseBotGoalParams = (params: unknown): BotGoalParams =>
  parseParams(botGoalParams, params);
export const parseBotSendParams = (params: unknown): BotSendParams =>
  parseParams(botSendParams, params);
export const parseBotReactParams = (params: unknown): BotReactParams =>
  parseParams(botReactParams, params);
export const parseBotUpdateParams = (params: unknown): BotUpdateParams =>
  parseParams(botUpdateParams, params);
export const parseBotMcpParams = (params: unknown): BotMcpParams =>
  parseParams(botMcpParams, params);
export const parseBotProviderParams = (params: unknown): BotProviderParams =>
  parseParams(botProviderParams, params);
export const parseBotThreadParams = (params: unknown): BotThreadParams =>
  parseParams(botThreadParams, params);
export const parseBotProjectParams = (params: unknown): BotProjectParams =>
  parseParams(botProjectParams, params);
export const parseBotSkillParams = (params: unknown): BotSkillParams =>
  parseParams(botSkillParams, params);
export const parseBotNotesParams = (params: unknown): BotNotesParams =>
  parseParams(botNotesParams, params);
export const parseBotApiParams = (params: unknown): BotApiParams =>
  parseParams(botApiParams, params);
export const parseBotCockpitParams = (params: unknown) => parseParams(botCockpitParams, params);
