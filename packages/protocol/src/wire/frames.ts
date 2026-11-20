import { z } from "zod";

import { BOT_MESSAGE_ID } from "../bots";
import { CONTEXT_SEGMENT_IDS } from "../context-segments";
import { MAX_ARTIFACTS_PER_CALL } from "../events";
import { ARTIFACT_MEDIA_TYPES, ARTIFACT_NAME } from "../runtime-wire";
import type { CallMethod, RunOutcome, RuntimeToControlPlane } from "../types";
import { runId } from "./shared";

const outcomes = [
  "response",
  "blocked",
  "interaction",
  "error",
] as const satisfies readonly RunOutcome[];

const callMethods = [
  "memory.append",
  "repo.access",
  "repo.folder",
  "skills.get",
  "mcp.report",
  "codex.auth",
  "bot.memory",
  "bot.create",
  "bot.delete",
  "bot.update",
  "bot.send",
  "bot.react",
  "bot.question",
  "bot.schedule",
  "bot.goal",
  "bot.skill",
  "bot.mcp",
  "bot.provider",
  "bot.thread",
  "bot.project",
  "bot.notes",
  "memory.notes",
  "bot.cockpit",
  "bot.api",
  "cockpit.read",
  "fork.start",
  "fork.status",
  "environment.save",
  "environment.read",
  "machine.call",
] as const satisfies readonly CallMethod[];

const BOT_SAY_MAX = 2000;
const BOT_ACTIVITY_MAX = 80;

const toolArtifact = z.object({
  name: z.string().regex(ARTIFACT_NAME),
  mediaType: z.enum(ARTIFACT_MEDIA_TYPES),
  caption: z.string().max(500).optional(),
});

const sentArtifact = z.object({
  name: z.string().regex(ARTIFACT_NAME),
  mediaType: z.enum(ARTIFACT_MEDIA_TYPES),
  title: z.string().trim().min(1).max(120).optional(),
  size: z.int().nonnegative().optional(),
});

const subagentTool = z.object({
  id: z.string(),
  name: z.string(),
  target: z.string(),
  status: z.enum(["running", "done", "error"]),
});

const subagentPart = z.object({
  index: z.int().nonnegative(),
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
  artifacts: z.array(toolArtifact).max(MAX_ARTIFACTS_PER_CALL).optional(),
  subagents: z.array(subagentPart).optional(),
});

const tokenCount = z.int().nonnegative();
const seq = z.int().positive();

export const ALLOWED_RUN_EVENT_TYPES = [
  "text",
  "reasoning",
  "steer_applied",
  "tool_start",
  "tool_end",
  "subagent",
  "usage",
  "limits",
] as const;

export const runEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), delta: z.string() }),
  z.object({ type: z.literal("reasoning"), delta: z.string() }),
  z.object({ type: z.literal("steer_applied"), id: z.string().min(1).max(100) }),
  z.object({ type: z.literal("tool_start"), tool: toolPart }),
  z.object({
    type: z.literal("tool_end"),
    id: z.string(),
    status: z.enum(["done", "error"]),
    output: z.string().optional(),
    artifacts: z.array(toolArtifact).max(MAX_ARTIFACTS_PER_CALL).optional(),
  }),
  z.object({
    type: z.literal("subagent"),
    index: z.int().nonnegative(),
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
      .object({
        usedTokens: tokenCount,
        contextWindow: z.int().positive().optional(),
        segments: z
          .array(
            z.object({
              id: z.enum(CONTEXT_SEGMENT_IDS),
              tokens: tokenCount,
            }),
          )
          .optional(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal("limits"),
    limits: z
      .array(
        z.object({
          window: z.enum(["five_hour", "seven_day"]),
          status: z.enum(["allowed", "allowed_warning", "rejected"]),
          percent: z.number().min(0).max(100),
          resetsAt: z.number().nonnegative().optional(),
        }),
      )
      .max(2),
  }),
]);

const bytes = z
  .int()
  .nonnegative()
  .max(2 ** 50);

const hostStats = z
  .object({
    cores: z.int().min(1).max(4096),
    cpuPercent: z.number().min(0).max(100).nullable(),
    memoryUsedBytes: bytes,
    memoryTotalBytes: bytes,
    diskUsedBytes: bytes,
    diskTotalBytes: bytes,
    sandboxes: z.int().nonnegative().max(100_000),
  })
  .refine(
    (stats) =>
      stats.memoryUsedBytes <= stats.memoryTotalBytes &&
      stats.diskUsedBytes <= stats.diskTotalBytes,
    "used is more than the total",
  );

export const frame = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    version: z.number(),
    runs: z.array(runId).default([]),
    build: z.string().max(64).optional(),
    canUpdate: z.boolean().optional(),
    host: z.boolean().optional(),
    dirs: z.array(z.string().min(1).max(1024)).max(50).optional(),
    backends: z.array(z.string().min(1).max(40)).max(20).optional(),
    guests: z.array(z.string().min(1).max(200)).max(500).optional(),
    github: z.object({ login: z.string().min(1).max(100).nullable() }).optional(),
  }),
  z.object({ type: z.literal("host.stats"), stats: hostStats }),
  z.object({
    type: z.literal("process.ended"),
    threadId: z.uuid(),
    processId: z.string().min(1).max(200),
    command: z.string().max(2_000),
    status: z.string().max(40),
    exitCode: z.int().nullable(),
    ranSeconds: z.number().min(0),
    stdout: z.string().max(20_000),
    stderr: z.string().max(20_000),
  }),
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
    quote: z.string().trim().regex(BOT_MESSAGE_ID).optional(),
    files: z.array(sentArtifact).max(MAX_ARTIFACTS_PER_CALL).optional(),
  }),
  z.object({
    type: z.literal("bot.end"),
    replyId: z.string().min(1),
    error: z.string().optional(),
  }),
  z.object({
    type: z.literal("bot.activity"),
    replyId: z.string().min(1),
    label: z.string().trim().min(1).max(BOT_ACTIVITY_MAX).nullable(),
  }),
  z.object({ type: z.literal("terminal.opened"), viewerId: z.string().min(1) }),
  z.object({
    type: z.literal("terminal.closed"),
    viewerId: z.string().min(1),
    reason: z.string(),
  }),
  z.object({ type: z.literal("port.opened"), viewerId: z.string().min(1) }),
  z.object({
    type: z.literal("port.closed"),
    viewerId: z.string().min(1),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("call"),
    id: z.string().min(1),
    method: z.enum(callMethods),
    params: z.unknown().optional(),
  }),
  z
    .object({
      type: z.literal("reply"),
      id: z.string(),
      ok: z.boolean(),
      result: z.unknown().optional(),
      error: z.string().optional(),
      code: z.string().optional(),
    })
    .loose(),
]);

type Assignable<T extends U, U> = T;
type ParamsOptional<T> = T extends { type: "call" } ? Omit<T, "params"> & { params?: unknown } : T;
type _CheckedFrame = Assignable<z.infer<typeof frame>, ParamsOptional<RuntimeToControlPlane>>;
type _CheckedRunEventTypes = Assignable<
  z.infer<typeof runEvent>["type"],
  (typeof ALLOWED_RUN_EVENT_TYPES)[number]
>;

export function parseRuntimeFrame(raw: string): RuntimeToControlPlane | null {
  try {
    const parsed = frame.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as RuntimeToControlPlane) : null;
  } catch {
    return null;
  }
}

export type WireRunEvent = z.infer<typeof runEvent>;
