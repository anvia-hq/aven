export type Project = {
  id: string;
  name: string;
  /** The imported repository, `owner/name`. */
  repoFullName: string;
  defaultBranch: string;
  /** The runner that hosts the project's sandboxes. */
  runtimeId: string;
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
};

/** The person's own GitHub account, connected so that what they ship is theirs on GitHub. */
export type GithubAccount = { connected: boolean; login: string | null };

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
