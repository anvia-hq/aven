export const LIVE_TIMELINE_LIMIT = 4;

export const LIVE_RECENT_TAIL = 3;

export function timelineWindow<T>(items: readonly T[], windowed: boolean) {
  if (!windowed || items.length <= LIVE_TIMELINE_LIMIT) {
    return { older: [] as readonly T[], recent: items };
  }

  const split = items.length - LIVE_RECENT_TAIL;
  return {
    older: items.slice(0, split),
    recent: items.slice(split),
  };
}
