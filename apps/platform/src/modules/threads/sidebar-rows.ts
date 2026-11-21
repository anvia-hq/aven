import { nestForks } from "./fork-nesting";
import type { SidebarRow, Thread } from "./types";

export function buildSidebarRows(
  list: Thread[],
  pairs: readonly [string, string][],
  partnerOf: (id: string) => string | undefined,
): SidebarRow[] {
  const byId = new Map(list.map((thread) => [thread.id, thread]));
  const leftIds = new Set(pairs.map(([left]) => left));
  const nested = nestForks(list);
  const position = new Map(nested.map((entry, index) => [entry.thread.id, index]));

  const partnerInList = (id: string) => {
    const partnerId = partnerOf(id);

    if (!partnerId || partnerId === id) return undefined;

    return byId.get(partnerId);
  };

  const joins = (at: number) => {
    const neighbour = nested[at];
    return neighbour?.nested === true && !partnerInList(neighbour.thread.id);
  };

  const result: SidebarRow[] = [];
  for (let index = 0; index < nested.length; index++) {
    const entry = nested[index]!;
    const partner = partnerInList(entry.thread.id);

    if (partner) {
      if (index > (position.get(partner.id) ?? index)) continue;

      const pair: [Thread, Thread] = leftIds.has(partner.id)
        ? [partner, entry.thread]
        : [entry.thread, partner];
      result.push({ kind: "pair", pair });
      continue;
    }

    result.push({
      kind: "thread",
      thread: entry.thread,
      nested: entry.nested,
      first: !joins(index - 1),
      last: !joins(index + 1),
    });
  }
  return result;
}
