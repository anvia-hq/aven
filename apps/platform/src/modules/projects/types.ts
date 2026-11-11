import type { useAddFolder } from "./hooks/use-add-folder";

export type Project = {
  id: string;
  name: string;
  repoFullName: string | null;
  defaultBranch: string | null;
  directory: string | null;
  runtimeId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectsView = "all" | "mine" | "working";

export type ProjectsSearch = {
  q?: string;
  view?: ProjectsView;
  runner?: string;
};

export type ProjectFilters = {
  query?: string;
  view: ProjectsView;
  runnerId?: string;
};

export type ProjectFilterContext = {
  me?: string;
  running: ReadonlySet<string>;
};

export type ImportStage =
  | { kind: "failed"; message: string }
  | { kind: "not-configured" }
  | { kind: "connect" }
  | { kind: "no-runner" }
  | { kind: "ready" };

export type GithubStatus = {
  configured: boolean;
  installUrl: string | null;
  canSetUp: boolean;
  appKey: string;
  own: boolean;
  canSetUpWorkspace: boolean;
};

export type GithubAccount = { connected: boolean; login: string | null; appKey: string };

export type GithubInstallation = {
  id: string;
  accountLogin: string;
};

export type GithubRepo = {
  id: number;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
};

export type RepoEntry = { name: string; path: string; type: "file" | "directory" };

export type RepoReadme = { name: string; path: string; text: string; truncated: boolean };

export type RepoCommit = {
  sha: string;
  message: string;
  author: string | null;
  authorAvatar: string | null;
  date: string;
  parents: string[];
  refs: string[];
  tags: string[];
};

export type RepoCommitPage = { commits: RepoCommit[]; hasMore: boolean };

export type TrackedKind = "pull" | "issue";
export type TrackedState = "open" | "closed" | "merged" | "all";

export type TrackedItem = {
  number: number;
  title: string;
  url: string;
  author: string | null;
  status: "open" | "draft" | "merged" | "closed";
  comments: number;
  updatedAt: string;
  labels: string[];
};

export type TrackedPage = { items: TrackedItem[]; total: number; hasMore: boolean };

export type AddFolderState = ReturnType<typeof useAddFolder>;

export type OrbColors = readonly [string, string, string];

export type Rgb = readonly [number, number, number];

export type Ring = { across: number; turn: number; speed: number };

export type Dot = {
  lobe: number;
  spread: number;
  start: number;
  reach: number;
  curl: number;
  rate: number;
  phase: number;
  wobble: number;
  wobblePhase: number;
  twinkle: number;
  size: number;
  alpha: number;
  tone: number;
};

export type OrbShape = { light: number; rings: Ring[]; dots: Dot[] };
