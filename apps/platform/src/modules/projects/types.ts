export type Project = {
  id: string;
  name: string;
  /** The imported repository, `owner/name`. */
  repoFullName: string;
  defaultBranch: string;
  /** The runner that hosts the project's sandboxes. */
  runtimeId: string;
  /** Who imported it, who with an owner or an admin may change or delete it. */
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

/** What the import dialog can show: the form once there is something to pick from, else why not. */
export type ImportStage =
  | { kind: "failed"; message: string }
  | { kind: "not-configured" }
  | { kind: "connect" }
  | { kind: "no-runner" }
  | { kind: "ready" };

export type GithubStatus = {
  configured: boolean;
  /** Where to send the browser to install the app on a GitHub account; null when not configured. */
  installUrl: string | null;
  /** The person is a platform owner and there is no app yet: they can have it created from here. */
  canSetUp: boolean;
  /** Which app the workspace acts as: `platform`, or the id of the one it made for itself (decision 0123). */
  appKey: string;
  /** The workspace has an app of its own. */
  own: boolean;
  /** The person is an owner or an admin of a workspace that has no app of its own yet. */
  canSetUpWorkspace: boolean;
};

/** The person's own GitHub account, connected so that what they ship is theirs on GitHub. */
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

/** An entry of a folder of a project's repository (`GET /projects/:id/files`), folders first. */
export type RepoEntry = { name: string; path: string; type: "file" | "directory" };

/** A project's README as text (`GET /projects/:id/readme`; decision 0082). */
export type RepoReadme = { name: string; path: string; text: string; truncated: boolean };

/** A commit of a project's default branch (`GET /projects/:id/commits`): the first line of its message. */
export type RepoCommit = {
  sha: string;
  message: string;
  author: string | null;
  /** Their picture on GitHub, if the commit is tied to an account. */
  authorAvatar: string | null;
  date: string;
  /** The commits it follows, the first being the branch it was made on; the graph is drawn from them (decision 0090). */
  parents: string[];
  /** The branches whose latest commit it is. */
  refs: string[];
  /** The tags that name it, releases among them. */
  tags: string[];
};

/** One page of a project's commit history, and whether there is an older one. */
export type RepoCommitPage = { commits: RepoCommit[]; hasMore: boolean };

export type TrackedKind = "pull" | "issue";
export type TrackedState = "open" | "closed" | "merged" | "all";

/** A pull request or an issue of a project's repository (`GET /projects/:id/pulls` and `/issues`; decision 0092). */
export type TrackedItem = {
  number: number;
  title: string;
  url: string;
  author: string | null;
  /** A pull request may be a draft or merged; an issue is open or closed. */
  status: "open" | "draft" | "merged" | "closed";
  comments: number;
  updatedAt: string;
  labels: string[];
};

/** One page of them, how many there are in all and whether there is a later page. */
export type TrackedPage = { items: TrackedItem[]; total: number; hasMore: boolean };
