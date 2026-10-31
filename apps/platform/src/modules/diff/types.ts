/** What the control plane says about a thread's changes (`GET /threads/:id/diff`). */
export type ThreadDiffResponse =
  | { available: false }
  | { available: true; patch: string; truncated: boolean };

/** `turn` is what the latest run changed; `all` everything since the branch left the default branch. */
const DIFF_SCOPES = ["turn", "all"] as const;

export type DiffScope = (typeof DIFF_SCOPES)[number];

/** What `useThreadDiff` can ask for: the panel's two, and `unshipped`, what the pull request does not have yet. */
export type ThreadDiffScope = DiffScope | "unshipped";

export const isDiffScope = (value: unknown): value is DiffScope =>
  (DIFF_SCOPES as readonly unknown[]).includes(value);

const DIFF_LAYOUTS = ["unified", "split"] as const;

export type DiffLayout = (typeof DIFF_LAYOUTS)[number];

export const isDiffLayout = (value: unknown): value is DiffLayout =>
  (DIFF_LAYOUTS as readonly unknown[]).includes(value);

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
