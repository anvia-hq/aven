import type {
  AgentOutcome,
  AgentStreamEvent,
  ToolCallPart,
  ToolResultOutput,
  Usage,
} from "@anvia/core";
import type { DurableEvent } from "@anvia/durable";
import { projectStreamEvent } from "@aven/agents/projection";
import { projectToolCall, projectToolEnd } from "@aven/agents/tool-projection";
import { tokenUsageOf } from "@aven/agents/usage";
import { asRecord } from "@aven/agents/values";
import type { RunEvent } from "@aven/protocol/events";

/** How a durable run ended, as far as the control plane is told (see `RunOutcome` on the wire). */
export type DurableEnd =
  | { type: "response"; messages: AgentOutcome<unknown>["messages"] }
  | { type: "interaction"; continuation: unknown; messages: AgentOutcome<unknown>["messages"] }
  | { type: "error"; error: string };

// Only these deltas are of interest to a client; reasoning and provider payloads are private.
const DELTAS = new Set(["text_delta", "tool_call"]);

// Durable journals a run as events of its own. This turns them back into what a client sees:
// the same run events the agent's stream used to project, plus how the run ended.
export function createDurableEventMapper(options: { contextWindow?: number } = {}) {
  // A tool's result names its operation, not its call; the call arrives with `tool_started`.
  const calls = new Map<string, { id: string; name?: string }>();
  // Some models stream the finished call, others do not: a call is announced once, by whichever comes first.
  const announced = new Set<string>();

  function map(event: DurableEvent): { events: RunEvent[]; end?: DurableEnd } {
    const data = asRecord(event.data);
    switch (event.type) {
      case "model_delta": {
        const delta = asRecord(data.event);
        if (typeof delta.type !== "string" || !DELTAS.has(delta.type)) return { events: [] };
        const projected = projectStreamEvent(delta as unknown as AgentStreamEvent);
        if (projected?.type === "tool_start") announced.add(projected.tool.id);
        return { events: projected ? [projected] : [] };
      }
      case "model_completed": {
        const result = asRecord(data.result);
        // A model whose stream has no finished call, and a call that is never started (a question
        // parks the run before its tool runs), are announced here, from the finished turn: without
        // it the client never learns of the question and shows none until it reloads.
        const events: RunEvent[] = toolCallsOf(result.choice).flatMap((call) => {
          if (announced.has(call.toolCallId)) return [];
          announced.add(call.toolCallId);
          return [{ type: "tool_start" as const, tool: projectToolCall(call) }];
        });
        const usage = asRecord(result.usage) as unknown as Usage;
        if (typeof usage.inputTokens === "number") {
          const { contextWindow } = options;
          // The size of the context is the request's, which a turn that is no model call (the one
          // that only reports a compaction, decision 0097) gives itself.
          const used = asRecord(result.contextUsage).usedTokens;
          events.push({
            type: "usage",
            turn: tokenUsageOf(usage),
            context: contextWindow
              ? { usedTokens: typeof used === "number" ? used : usage.inputTokens, contextWindow }
              : undefined,
          });
        }
        return { events };
      }
      case "tool_started": {
        const call = asRecord(asRecord(data.input).toolCall);
        if (typeof data.operationId === "string" && typeof call.toolCallId === "string")
          calls.set(data.operationId, {
            id: call.toolCallId,
            name: typeof call.toolName === "string" ? call.toolName : undefined,
          });
        if (typeof call.toolCallId !== "string" || announced.has(call.toolCallId))
          return { events: [] };
        announced.add(call.toolCallId);
        return {
          events: [{ type: "tool_start", tool: projectToolCall(call as unknown as ToolCallPart) }],
        };
      }
      case "tool_completed": {
        const call = typeof data.operationId === "string" ? calls.get(data.operationId) : undefined;
        const output = asRecord(data.result).output as ToolResultOutput | undefined;
        if (!call || !output) return { events: [] };
        return { events: [projectToolEnd(call.id, output, call.name)] };
      }
      // The agent took a message the person sent while it worked (decision 0098).
      case "steering_applied":
        return typeof data.id === "string"
          ? { events: [{ type: "steer_applied", id: data.id }] }
          : { events: [] };
      case "status":
        return { events: [], end: endOf(data) };
      default:
        return { events: [] };
    }
  }

  return { map };
}

// The tool calls of a finished model turn, in the order the model made them.
function toolCallsOf(choice: unknown): ToolCallPart[] {
  if (!Array.isArray(choice)) return [];
  return choice.filter(
    (part): part is ToolCallPart =>
      asRecord(part).type === "tool-call" &&
      typeof asRecord(part).toolCallId === "string" &&
      typeof asRecord(part).toolName === "string",
  );
}

function endOf(data: Record<string, unknown>): DurableEnd | undefined {
  const outcome = asRecord(data.outcome);
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
