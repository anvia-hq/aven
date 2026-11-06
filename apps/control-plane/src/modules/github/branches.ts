// A repository's branches as Center lists them: where each stands against the default branch, what
// it last did and which open pull request, if any, is for it.

export type GithubBranchSummary = {
  name: string;
  isDefault: boolean;
  protected: boolean;
  /** Commits it has that the default branch does not, and the reverse. */
  ahead: number;
  behind: number;
  lastCommit: { sha: string; message: string; author: string | null; date: string } | null;
  /** The open pull request that has this branch as its head, from this repository. */
  pull: { number: number; title: string } | null;
};

/** At most this many branches are looked at, the default one and the most recently active others. */
export const BRANCHES_SUMMARIZED = 30;
/** How many of GitHub's calls for them run at once. */
export const BRANCH_CALLS_AT_ONCE = 6;

// The same results in the same order, with at most `limit` of the calls running at a time.
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

export type OpenPullPayload = {
  number: number;
  title: string;
  head: { ref: string; repo: { full_name: string } | null };
};

// The open pull request of each branch of this repository: a pull request from a fork is not for a
// branch of ours, even if the branch has the same name.
export function pullsByBranch(pulls: OpenPullPayload[], fullName: string) {
  const byBranch = new Map<string, { number: number; title: string }>();
  for (const pull of pulls) {
    if (pull.head.repo?.full_name !== fullName || byBranch.has(pull.head.ref)) continue;
    byBranch.set(pull.head.ref, { number: pull.number, title: pull.title });
  }
  return byBranch;
}
