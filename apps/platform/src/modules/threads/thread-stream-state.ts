import { applyEvent, applyLimits, applyUsage, isRunning, messageId } from "@aven/protocol/events";
import type { ChatMessage, RunEvent } from "@aven/protocol/types";

import { handoffOf, settlePending, withoutPending } from "./pending-messages";
import type { ThreadStreamAction, ThreadStreamState } from "./types";

function hasDeliveredOutput(messages: readonly ChatMessage[]) {
  return messages.some(
    (message) =>
      message.role === "assistant" &&
      message.parts.some(
        (part) =>
          part.type === "text" ||
          (part.type === "tool" && (part.tool.status === "done" || Boolean(part.tool.questions))),
      ),
  );
}

export const INITIAL_THREAD_STREAM_STATE: ThreadStreamState = {
  messages: [],
  handoffs: {},
  narrations: {},
  sandboxPhase: null,
  sandboxOptimistic: false,
  earlier: [],
  hidden: 0,
  running: false,
  startedAt: null,
  usage: null,
  synced: false,
  error: null,
  steers: [],
  pending: [],
  rejectedNotice: null,
};

export function reduceThreadStream(
  state: ThreadStreamState,
  action: ThreadStreamAction,
): ThreadStreamState {
  switch (action.type) {
    case "reset":
      return INITIAL_THREAD_STREAM_STATE;
    case "connection_lost":
      return {
        ...state,
        running: false,
        startedAt: null,
        error: "Lost the connection to the server",
        sandboxPhase: state.sandboxPhase === "preparing" ? null : state.sandboxPhase,
        sandboxOptimistic: false,
      };
    case "earlier_loaded":
      if (state.hidden !== action.before) return state;

      return {
        ...state,
        hidden: action.hidden,
        earlier: [...action.messages, ...state.earlier],
      };
    case "steer_add":
      return { ...state, steers: [...state.steers, action.steer] };
    case "steer_drop":
      return { ...state, steers: state.steers.filter((steer) => steer.id !== action.id) };
    case "pending_add": {
      const optimistic =
        action.sandbox === true && state.messages.length === 0 && state.sandboxPhase === null;
      return {
        ...state,
        pending: [...state.pending, action.item],
        sandboxPhase: optimistic ? "preparing" : state.sandboxPhase,
        sandboxOptimistic: optimistic ? true : state.sandboxOptimistic,
      };
    }
    case "pending_drop": {
      const pending = withoutPending(state.pending, action.id);
      const clearOptimistic =
        state.sandboxOptimistic &&
        pending.length === 0 &&
        state.messages.length === 0 &&
        !state.running;
      return {
        ...state,
        pending,
        sandboxPhase: clearOptimistic ? null : state.sandboxPhase,
        sandboxOptimistic: clearOptimistic ? false : state.sandboxOptimistic,
      };
    }
    case "event":
      return applyStreamEvent(state, action.event, action.now);
  }
}

function applyStreamEvent(
  state: ThreadStreamState,
  event: RunEvent,
  now: number,
): ThreadStreamState {
  const handoff = handoffOf(state.pending, state.steers, event);
  const realId = messageId(state.messages.length);
  const messages = applyEvent(state.messages, event);
  const handoffs = handoff ? { ...state.handoffs, [realId]: handoff } : state.handoffs;
  const running = isRunning(state.running, event);
  const pending = settlePending(state.pending, event);

  const next: ThreadStreamState = { ...state, messages, handoffs, running, pending };

  switch (event.type) {
    case "steer_queued":
      return {
        ...next,
        steers: state.steers.some(({ id }) => id === event.id)
          ? state.steers
          : [...state.steers, { id: event.id, prompt: event.prompt, mentions: event.mentions }],
      };
    case "steer":
      return { ...next, steers: state.steers.filter(({ id }) => id !== event.id) };
    case "steer_rejected": {
      const lost = event.reason ? state.steers.find(({ id }) => id === event.id) : undefined;
      return {
        ...next,
        steers: state.steers.filter(({ id }) => id !== event.id),
        rejectedNotice:
          lost && event.reason
            ? { id: event.id, prompt: lost.prompt, reason: event.reason }
            : state.rejectedNotice,
      };
    }
    case "snapshot": {
      const keepOptimistic =
        event.sandboxPhase === undefined &&
        state.sandboxOptimistic &&
        pending.length > 0 &&
        messages.length === 0;
      const sandboxPhase = keepOptimistic ? state.sandboxPhase : (event.sandboxPhase ?? null);
      return {
        ...next,
        handoffs: {},
        narrations: event.narrations ?? {},
        sandboxPhase,
        sandboxOptimistic: keepOptimistic,
        hidden: event.hidden ?? 0,
        earlier: [],
        steers: event.steers ?? [],
        error: event.error ?? null,
        synced: true,
        usage: event.usage
          ? { ...event.usage, limits: event.usage.limits ?? state.usage?.limits }
          : null,
        startedAt: event.running ? now - (event.runningMs ?? 0) : null,
      };
    }
    case "sandbox_status":
      return {
        ...next,
        sandboxPhase: event.phase,
        sandboxOptimistic: false,
      };
    case "text":
    case "tool_start":
    case "tool_end":
      if (state.sandboxOptimistic && state.sandboxPhase === "preparing") {
        return {
          ...next,
          sandboxPhase: "ready",
          sandboxOptimistic: false,
        };
      }

      return next;
    case "narration":
      return {
        ...next,
        narrations: { ...state.narrations, [event.narration.toolId]: event.narration },
      };
    case "usage":
      return { ...next, usage: applyUsage(state.usage, event) };
    case "limits":
      return { ...next, usage: applyLimits(state.usage, event.limits) };
    case "run_start":
    case "run_resume":
      return { ...next, error: null, startedAt: now };
    case "error":
      return {
        ...next,
        error: event.message,
        startedAt: null,
        sandboxPhase: state.sandboxPhase === "preparing" ? null : state.sandboxPhase,
        sandboxOptimistic: false,
      };
    case "done": {
      let sandboxPhase = state.sandboxPhase;

      if (sandboxPhase === "preparing") {
        sandboxPhase = hasDeliveredOutput(messages) ? "ready" : null;
      }

      return {
        ...next,
        startedAt: null,
        sandboxPhase,
        sandboxOptimistic: false,
      };
    }
    default:
      return next;
  }
}
