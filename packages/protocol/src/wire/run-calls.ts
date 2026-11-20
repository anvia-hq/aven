import type { Message } from "@anvia/core";
import { z } from "zod";

import { FORK_TEXT_MAX } from "../forks";
import { MACHINE_OPS, SKILL_DIGEST } from "../runtime-wire";
import type {
  CodexAuthParams,
  EnvironmentReadParams,
  EnvironmentSaveParams,
  ForkStartParams,
  ForkStatusParams,
  MachineRelayParams,
  McpReportParams,
  MemoryNotesParams,
  RepoAccessParams,
  SkillsGetParams,
} from "../types";
import { mcpConnectResults, memoryCommand, parseParams, replyId, runId } from "./shared";

const memoryParams = z.object({ runId }) satisfies z.ZodType<RepoAccessParams>;

const appendParams = memoryParams.extend({
  turn: z.int().nonnegative(),
  messages: z.array(z.custom<Message>((value) => typeof value === "object" && value !== null)),
});

const skillsGetParams = memoryParams.extend({
  digest: z.string().regex(SKILL_DIGEST),
}) satisfies z.ZodType<SkillsGetParams>;

const environmentSaveParams = memoryParams.extend({
  setupDigest: z.string().regex(SKILL_DIGEST),
}) satisfies z.ZodType<EnvironmentSaveParams>;

const codexAuthParams = z.object({
  previous: z.string().min(1).max(20_000),
  token: z.string().min(20).max(20_000),
}) satisfies z.ZodType<CodexAuthParams>;

const mcpReportParams = memoryParams.extend({
  results: mcpConnectResults,
}) satisfies z.ZodType<McpReportParams>;

const memoryNotesParams = z.object({
  runId,
  command: memoryCommand,
}) satisfies z.ZodType<MemoryNotesParams>;

const cockpitReadParams = z.object({ runId, command: z.unknown() });

const forkStartParams = z.object({
  runId,
  task: z.string().trim().min(1).max(FORK_TEXT_MAX),
  context: z.string().trim().min(1).max(FORK_TEXT_MAX),
  title: z.string().trim().min(1).max(120).optional(),
}) satisfies z.ZodType<ForkStartParams>;

const forkStatusParams = z.object({
  runId,
  id: z.uuid(),
  stop: z.boolean().optional(),
}) satisfies z.ZodType<ForkStatusParams>;

const machineOp = z.object({
  op: z.enum(MACHINE_OPS),
  args: z.unknown().optional(),
});

const machineRelayParams = z.union([
  machineOp.extend({ runId }),
  machineOp.extend({ replyId }),
]) satisfies z.ZodType<MachineRelayParams>;

export const parseMemoryParams = (params: unknown): RepoAccessParams =>
  parseParams(memoryParams, params);
export const parseMemoryNotesParams = (params: unknown): MemoryNotesParams =>
  parseParams(memoryNotesParams, params);
export const parseCockpitReadParams = (params: unknown) => parseParams(cockpitReadParams, params);
export const parseForkStartParams = (params: unknown): ForkStartParams =>
  parseParams(forkStartParams, params);
export const parseForkStatusParams = (params: unknown): ForkStatusParams =>
  parseParams(forkStatusParams, params);
export const parseMachineRelayParams = (params: unknown): MachineRelayParams =>
  parseParams(machineRelayParams, params);
export const parseAppendParams = (params: unknown) => parseParams(appendParams, params);
export const parseSkillsGetParams = (params: unknown): SkillsGetParams =>
  parseParams(skillsGetParams, params);
export const parseEnvironmentSaveParams = (params: unknown): EnvironmentSaveParams =>
  parseParams(environmentSaveParams, params);
export const parseEnvironmentReadParams = (params: unknown): EnvironmentReadParams =>
  parseParams(memoryParams, params);
export const parseMcpReportParams = (params: unknown): McpReportParams =>
  parseParams(mcpReportParams, params);
export const parseCodexAuthParams = (params: unknown): CodexAuthParams =>
  parseParams(codexAuthParams, params);
