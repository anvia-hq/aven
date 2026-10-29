import type { Message } from "@anvia/core";
import type { RuntimeToControlPlane } from "@aven/protocol/runtime-wire";
import { z } from "zod";

// A runtime is not trusted, so every frame it sends is checked before anything acts on it.
// `@aven/protocol` has the types and no runtime imports; the checking lives here.

const runId = z.string().min(1);

// The events a runtime's agent projects. Anything else (a snapshot, `done`) is the control plane's
// to send, so a runtime cannot forge a client's view of the conversation beyond its own run.
const toolPart = z.object({
  id: z.string(),
  name: z.string(),
  target: z.string(),
  status: z.enum(["running", "done", "error"]),
  diff: z.array(z.object({ type: z.enum(["add", "del", "ctx"]), text: z.string() })).optional(),
  output: z.string().optional(),
});

const runEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), delta: z.string() }),
  z.object({ type: z.literal("tool_start"), tool: toolPart }),
  z.object({
    type: z.literal("tool_end"),
    id: z.string(),
    status: z.enum(["done", "error"]),
    output: z.string().optional(),
  }),
]);

const frame = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), version: z.number() }),
  z.object({ type: z.literal("run.event"), runId, event: runEvent }),
  z.object({
    type: z.literal("run.end"),
    runId,
    outcome: z.enum(["response", "blocked", "interaction", "error"]),
    error: z.string().optional(),
  }),
  z.object({
    type: z.literal("call"),
    id: z.string().min(1),
    method: z.enum(["memory.load", "memory.append", "memory.clear"]),
    params: z.unknown().optional(),
  }),
  z.object({ type: z.literal("reply"), id: z.string() }).loose(),
]);

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

const appendParams = memoryParams.extend({
  turn: z.number().int().nonnegative(),
  messages: z.array(z.custom<Message>((value) => typeof value === "object" && value !== null)),
});

function parseParams<T>(schema: z.ZodType<T>, params: unknown) {
  const parsed = schema.safeParse(params);
  if (!parsed.success) throw new Error("Invalid parameters for this memory call");
  return parsed.data;
}

export const parseMemoryParams = (params: unknown) => parseParams(memoryParams, params);
export const parseAppendParams = (params: unknown) => parseParams(appendParams, params);
