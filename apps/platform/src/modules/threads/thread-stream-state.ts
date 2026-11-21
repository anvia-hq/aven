import { applyEvent, applyLimits, applyUsage, isRunning, messageId } from "@aven/protocol/events";
import type { RunEvent } from "@aven/protocol/types";

import { handoffOf, settlePending, withoutPending } from "./pending-messages";
import type { ThreadStreamAction, ThreadStreamState } from "./types";

export const INITIAL_THREAD_STREAM_STATE: ThreadStreamState = {
  messages: [],
  handoffs: {},
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
    case "pending_add":
      return { ...state, pending: [...state.pending, action.item] };
    case "pending_drop":
      return { ...state, pending: withoutPending(state.pending, action.id) };
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
    case "snapshot":
      return {
        ...next,
        handoffs: {},
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
    case "usage":
      return { ...next, usage: applyUsage(state.usage, event) };
    case "limits":
      return { ...next, usage: applyLimits(state.usage, event.limits) };
    case "run_start":
    case "run_resume":
      return { ...next, error: null, startedAt: now };
    case "error":
      return { ...next, error: event.message, startedAt: null };
    case "done":
      return { ...next, startedAt: null };
    default:
      return next;
  }
}
