import type { BotRailState } from "./types";

export const emptyRail: BotRailState = { shown: [], opened: [] };

function same(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((each, index) => each === right[index]);
}

export function afterWorking(state: BotRailState, working: ReadonlySet<string>): BotRailState {
  const opened = state.opened.filter((id) => !working.has(id));
  const shown = [...state.shown, ...[...working].filter((id) => !state.shown.includes(id))].filter(
    (id) => working.has(id) || !opened.includes(id),
  );

  if (same(opened, state.opened) && same(shown, state.shown)) return state;

  return { shown, opened };
}

export function afterOpened(
  state: BotRailState,
  id: string,
  working: ReadonlySet<string>,
): BotRailState {
  if (!state.shown.includes(id) || state.opened.includes(id)) return state;

  const opened = [...state.opened, id];
  const shown = working.has(id) ? state.shown : state.shown.filter((each) => each !== id);

  return { shown, opened };
}
