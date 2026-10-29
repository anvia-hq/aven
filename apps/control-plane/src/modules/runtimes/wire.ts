import type { Message } from "@anvia/core";
import type { RunEvent } from "@aven/protocol/events";
import type { RuntimeToControlPlane } from "@aven/protocol/runtime-wire";
import { z } from "zod";

// A runtime is not trusted, so every frame it sends is checked before anything acts on it.
// `@aven/protocol` has the types and no runtime imports; the checking lives here.

const runId = z.string().min(1);

// Events and stored messages are checked for their envelope only: a runtime can only misreport
// its own run, and the conversation scope never comes from the frame.
const runEvent = z.custom<RunEvent>(
  (value) => typeof value === "object" && value !== null && "type" in value,
);

const frame = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), version: z.number() }),
  z.object({ type: z.literal("run.event"), runId, event: runEvent }),
  z.object({
    type: z.literal("run.end"),
    runId,
    outcome: z.string(),
    error: z.string().optional(),
  }),
  z.object({ type: z.literal("job.notice"), threadId: z.string().min(1), notice: z.string() }),
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
