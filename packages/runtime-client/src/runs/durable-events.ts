import type {
  AgentOutcome,
  AgentStreamEvent,
  ContextBreakdownSource,
  ToolCallPart,
  ToolResultOutput,
  Usage,
} from "@anvia/core";
import type { DurableEvent } from "@anvia/durable";
import { projectStreamEvent } from "@aven/agents/projection";
import { projectToolCall, projectToolEnd } from "@aven/agents/tool-projection";
import { tokenUsageOf } from "@aven/agents/usage";
import { asRecord } from "@aven/agents/values";
import type { ContextUsage, RunEvent } from "@aven/protocol/types";
import type { DurableEnd } from "@aven/agent-backend/types";

import { segmentsOf } from "./context-segments";

const DELTAS = new Set(["text_delta", "reasoning_delta", "tool_call"]);

export function createDurableEventMapper(
  options: { contextWindow?: number; compacting?: boolean } = {},
) {
  const calls = new Map<string, { id: string; name?: string }>();
  const announced = new Set<string>();
  const requests = new Map<string, ContextBreakdownSource>();

  function map(event: DurableEvent): { events: RunEvent[]; end?: DurableEnd } {
    const data = asRecord(event.data);
    switch (event.type) {
      case "model_delta": {
        const delta = asRecord(data.event);

        if (typeof delta.type !== "string" || !DELTAS.has(delta.type)) return { events: [] };

        const projected = projectStreamEvent(delta as AgentStreamEvent);

        if (projected?.type === "tool_start") announced.add(projected.tool.id);

        return { events: projected ? [projected] : [] };
      }
      case "model_started": {
        const request = asRecord(asRecord(data.input).request);

        if (typeof data.operationId === "string" && Object.keys(request).length > 0)
          requests.set(data.operationId, request as ContextBreakdownSource);

        return { events: [] };
      }
      case "model_completed": {
        const result = asRecord(data.result);
        const events: RunEvent[] = toolCallsOf(result.choice).flatMap((call) => {
          if (announced.has(call.toolCallId)) return [];

          announced.add(call.toolCallId);
          return [{ type: "tool_start" as const, tool: projectToolCall(call) }];
        });
        const usage = asRecord(result.usage) as Usage;

        if (typeof usage.inputTokens === "number") {
          const { contextWindow } = options;
          const used = asRecord(result.contextUsage).usedTokens;
          const usedTokens = typeof used === "number" ? used : usage.inputTokens;
          const request =
            typeof data.operationId === "string" ? requests.get(data.operationId) : undefined;

          if (typeof data.operationId === "string") requests.delete(data.operationId);

          const context: ContextUsage | undefined =
            options.compacting && !contextWindow ? undefined : { usedTokens };

          if (context && contextWindow) context.contextWindow = contextWindow;

          const segments = context && request && segmentsOf(request, usedTokens);

          if (context && segments) context.segments = segments;

          events.push({ type: "usage", turn: tokenUsageOf(usage), context });
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
          events: [{ type: "tool_start", tool: projectToolCall(call as ToolCallPart) }],
        };
      }
      case "tool_completed": {
        const call = typeof data.operationId === "string" ? calls.get(data.operationId) : undefined;
        const output = asRecord(data.result).output as ToolResultOutput | undefined;

        if (!call || !output) return { events: [] };

        return { events: [projectToolEnd(call.id, output, call.name)] };
      }
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
