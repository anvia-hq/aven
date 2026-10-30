import type { AgentOutcome, AgentStreamEvent, ToolResultOutput, Usage } from "@anvia/core";
import type { DurableEvent } from "@anvia/durable";
import { projectStreamEvent, projectToolOutput, tokenUsageOf } from "@aven/agents/projection";
import type { RunEvent } from "@aven/protocol/events";

/** How a durable run ended, as far as the control plane is told (see `RunOutcome` on the wire). */
export type DurableEnd =
  | { type: "response"; messages: AgentOutcome<unknown>["messages"] }
  | { type: "interaction"; continuation: unknown; messages: AgentOutcome<unknown>["messages"] }
  | { type: "error"; error: string };

// Only these deltas are of interest to a client; reasoning and provider payloads are private.
const DELTAS = new Set(["text_delta", "tool_call"]);

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

// Durable journals a run as events of its own. This turns them back into what a client sees:
// the same run events the agent's stream used to project, plus how the run ended.
export function createDurableEventMapper(options: { contextWindow?: number } = {}) {
  // A tool's result names its operation, not its call; the call id arrives with `tool_started`.
  const calls = new Map<string, string>();

  function map(event: DurableEvent): { events: RunEvent[]; end?: DurableEnd } {
    const data = record(event.data);
    switch (event.type) {
      case "model_delta": {
        const delta = record(data.event);
        if (typeof delta.type !== "string" || !DELTAS.has(delta.type)) return { events: [] };
        const projected = projectStreamEvent(delta as unknown as AgentStreamEvent);
        return { events: projected ? [projected] : [] };
      }
      case "model_completed": {
        const usage = record(record(data.result).usage) as unknown as Usage;
        if (typeof usage.inputTokens !== "number") return { events: [] };
        const { contextWindow } = options;
        return {
          events: [
            {
              type: "usage",
              turn: tokenUsageOf(usage),
              context: contextWindow ? { usedTokens: usage.inputTokens, contextWindow } : undefined,
            },
          ],
        };
      }
      case "tool_started": {
        const call = record(record(data.input).toolCall);
        if (typeof data.operationId === "string" && typeof call.toolCallId === "string")
          calls.set(data.operationId, call.toolCallId);
        return { events: [] };
      }
      case "tool_completed": {
        const id = typeof data.operationId === "string" ? calls.get(data.operationId) : undefined;
        const output = record(data.result).output as ToolResultOutput | undefined;
        if (!id || !output) return { events: [] };
        const { status, output: text } = projectToolOutput(output);
        return { events: [{ type: "tool_end", id, status, output: text }] };
      }
      case "status":
        return { events: [], end: endOf(data) };
      default:
        return { events: [] };
    }
  }

  return { map };
}

function endOf(data: Record<string, unknown>): DurableEnd | undefined {
  const outcome = record(data.outcome);
  const messages = Array.isArray(outcome.messages)
    ? (outcome.messages as AgentOutcome<unknown>["messages"])
    : [];
  switch (data.status) {
    case "completed":
      return { type: "response", messages };
    case "waiting":
      // Only a question parks a run; anything else that waits is not something we handle.
      return outcome.type === "interaction"
        ? { type: "interaction", continuation: outcome.continuation, messages }
        : { type: "error", error: "The run is waiting for something Aven cannot provide" };
    case "failed":
      return { type: "error", error: String(data.error ?? "The agent run failed") };
    case "cancelled":
      return { type: "error", error: "The run was cancelled" };
    case "needs_attention":
      return {
        type: "error",
        error: `The run was interrupted and needs attention: ${String(data.error ?? "unknown cause")}`,
      };
    default:
      return undefined;
  }
}
