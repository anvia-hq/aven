import type { OpenPullPayload } from "./types";

export const BRANCHES_SUMMARIZED = 30;
export const BRANCH_CALLS_AT_ONCE = 6;

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  call: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await call(items[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export function pullsByBranch(pulls: OpenPullPayload[], fullName: string) {
  const byBranch = new Map<string, { number: number; title: string }>();
  for (const pull of pulls) {
    if (pull.head.repo?.full_name !== fullName || byBranch.has(pull.head.ref)) continue;
    byBranch.set(pull.head.ref, { number: pull.number, title: pull.title });
  }
  return byBranch;
}
