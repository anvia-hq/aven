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

export function pushedTimelineItems<T extends { id: string }>(
  previousRecent: readonly T[],
  nextRecent: readonly T[],
) {
  if (previousRecent.length === 0) {
    return { exiting: [] as readonly T[], enteringIds: new Set<string>() };
  }

  const nextIds = new Set(nextRecent.map((item) => item.id));
  const previousIds = new Set(previousRecent.map((item) => item.id));
  const exiting = previousRecent.slice(-LIVE_RECENT_TAIL).filter((item) => !nextIds.has(item.id));
  const enteringIds = new Set(
    nextRecent.flatMap((item) => (previousIds.has(item.id) ? [] : [item.id])),
  );
  return { exiting, enteringIds };
}
