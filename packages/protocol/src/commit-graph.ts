// How a page of commits is drawn as a graph (decision 0090): each commit gets a lane, a column of the
// drawing, and the lines that join it to the commits before and after it. Pure, so the platform
// draws it and tests read it.

/** A commit as the layout needs it: its own id and its parents', the first being the branch it was made on. */
export type GraphCommit = { sha: string; parents: readonly string[] };

/**
 * One row of the drawing, a commit's. Lanes are column numbers from 0:
 * - `lane` is where the commit's dot is;
 * - `up` are the lanes whose line comes down from the row above and ends at the dot: the commits
 *   above that lead to this one;
 * - `through` are the lanes whose line passes the whole row without touching the dot;
 * - `down` are the lanes the lines from the dot leave by, to the row below: the first parent's, and
 *   one for each other parent of a merge.
 */
export type GraphRow = { lane: number; up: number[]; through: number[]; down: number[] };

export type CommitGraph = { rows: GraphRow[]; lanes: number };

/**
 * Lays out commits given newest first, as `git log --graph` does. Each lane waits for the commit it
 * leads to; a commit takes the lane of the first one waiting for it (or a free one, as a branch's tip
 * does), and hands it on to its first parent. A merge's other parents join the lane already waiting
 * for them or open a new one. Only the commits given are known: a parent that is not among them
 * leaves its lane going down to the bottom of the page, and a commit whose children are above the
 * page starts with no line from above.
 */
export function layoutGraph(commits: readonly GraphCommit[]): CommitGraph {
  const waiting: (string | null)[] = [];
  const rows: GraphRow[] = [];
  let lanes = 0;
  const free = () => {
    const index = waiting.indexOf(null);
    return index === -1 ? waiting.length : index;
  };

  for (const { sha, parents } of commits) {
    const up = waiting.flatMap((target, index) => (target === sha ? [index] : []));
    const through = waiting.flatMap((target, index) =>
      target !== null && target !== sha ? [index] : [],
    );
    const lane = up[0] ?? free();
    for (const index of up) waiting[index] = null;

    const down: number[] = [];
    const [first, ...others] = parents;
    if (first !== undefined) {
      waiting[lane] = first;
      down.push(lane);
    }
    for (const parent of others) {
      const joined = waiting.indexOf(parent);
      if (joined !== -1) {
        down.push(joined);
        continue;
      }
      const opened = free();
      waiting[opened] = parent;
      down.push(opened);
    }
    while (waiting.length > 0 && waiting.at(-1) === null) waiting.pop();

    rows.push({ lane, up, through, down });
    lanes = Math.max(
      lanes,
      lane + 1,
      ...up.map((l) => l + 1),
      ...through.map((l) => l + 1),
      ...down.map((l) => l + 1),
    );
  }
  return { rows, lanes };
}
