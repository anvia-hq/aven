/** What the control plane says about a thread's changes (`GET /threads/:id/diff`). */
export type ThreadDiffResponse =
  | { available: false }
  | { available: true; patch: string; truncated: boolean };

/** `turn` is what the latest run changed; `all` everything since the branch left the default branch. */
export type DiffScope = "turn" | "all";

export type DiffLayout = "unified" | "split";

export type DiffRow = {
  kind: "add" | "del" | "ctx";
  /** Line numbers in the old and new file; a deleted line has no new one and the reverse. */
  oldNo?: number;
  newNo?: number;
  text: string;
};

export type DiffHunk = {
  header: string;
  rows: DiffRow[];
};

export type DiffFile = {
  path: string;
  /** The name before a rename. */
  oldPath?: string;
  status: "added" | "deleted" | "renamed" | "modified";
  binary: boolean;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
};

/** A line of the split layout: what the old file had beside what the new one has. */
export type SplitRow = { old?: DiffRow; new?: DiffRow };
