export type GraphCommit = { sha: string; parents: readonly string[] };

export type GraphRow = { lane: number; up: number[]; through: number[]; down: number[] };

export type CommitGraph = { rows: GraphRow[]; lanes: number };

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
