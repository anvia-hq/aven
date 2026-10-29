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

export type GithubStatus = {
  configured: boolean;
  /** Where to send the browser to install the app on a GitHub account; null when not configured. */
  installUrl: string | null;
};

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
