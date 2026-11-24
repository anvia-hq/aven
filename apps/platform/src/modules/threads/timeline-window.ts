export const LIVE_TIMELINE_WINDOW = 4;

const LIVE_EXIT_BUFFER = 4;

export function timelineWindow<T>(items: readonly T[], windowed: boolean) {
  if (!windowed || items.length <= LIVE_TIMELINE_WINDOW) {
    return { items, visibleFrom: 0 };
  }

  const start = Math.max(0, items.length - LIVE_TIMELINE_WINDOW - LIVE_EXIT_BUFFER);
  const sliced = items.slice(start);
  const visibleFrom = sliced.length - LIVE_TIMELINE_WINDOW;
  return { items: sliced, visibleFrom };
}
