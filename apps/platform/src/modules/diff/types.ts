import type { HighlightedLine } from "@/modules/files/types";

export type ThreadDiffResponse =
  | { available: false }
  | { available: true; patch: string; truncated: boolean };

const DIFF_SCOPES = ["turn", "unshipped", "all"] as const;

export type DiffScope = (typeof DIFF_SCOPES)[number];

export type ThreadDiffScope = DiffScope;

export const isDiffScope = (value: unknown): value is DiffScope =>
  (DIFF_SCOPES as readonly unknown[]).includes(value);

const DIFF_LAYOUTS = ["unified", "split"] as const;

export type DiffLayout = (typeof DIFF_LAYOUTS)[number];

export const isDiffLayout = (value: unknown): value is DiffLayout =>
  (DIFF_LAYOUTS as readonly unknown[]).includes(value);

export type DiffRow = {
  kind: "add" | "del" | "ctx";
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
  oldPath?: string;
  status: "added" | "deleted" | "renamed" | "modified";
  binary: boolean;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
};

export type SplitRow = { old?: DiffRow; new?: DiffRow };

export type ThreadDiff = {
  loaded: boolean;
  problem: string | null;
  available: boolean | null;
  truncated: boolean;
  files: DiffFile[];
  additions: number;
  deletions: number;
};

export type DiffItem =
  | { kind: "file"; file: DiffFile; open: boolean; first: boolean }
  | { kind: "note"; file: DiffFile }
  | { kind: "hunk"; file: DiffFile; header: string }
  | { kind: "unified"; file: DiffFile; row: DiffRow; last: boolean }
  | { kind: "split"; file: DiffFile; pair: SplitRow; last: boolean };

export type FileColours = { old: HighlightedLine[] | null; new: HighlightedLine[] | null };
