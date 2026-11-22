export type InstallationPayload = {
  id: number;
  account: { login: string; type?: string } | null;
  repository_selection?: string;
  permissions?: Record<string, string>;
};

export type AccessTokenPayload = {
  token: string;
  expires_at?: string;
};

export type RepositoryListEntryPayload = {
  full_name: string;
  clone_url: string;
  default_branch: string;
  private: boolean;
};

export type RepositoryPayload = RepositoryListEntryPayload & {
  id: number;
};

export type InstallationRepositoriesPayload = {
  repositories: RepositoryListEntryPayload[];
};

export type UserInstallationsPayload = {
  installations: { id: number }[];
};

export type RepositoryPermissionsPayload = {
  full_name?: string;
  permissions?: { push?: boolean };
};

export type ContentsEntryPayload = {
  name: string;
  path: string;
  type: string;
};

export type ReadmePayload = {
  name: string;
  path: string;
  content?: string;
  encoding?: string;
};

export type FileContentPayload = {
  type?: string;
  path?: string;
  content?: string;
  encoding?: string;
};

export type CommitPayload = {
  sha: string;
  commit: { message: string; author: { name: string; date: string } | null };
  author: { login: string; avatar_url?: string } | null;
  parents: { sha: string }[];
};

export type CommitDetailPayload = CommitPayload & {
  html_url: string;
  stats?: { additions: number; deletions: number };
  files?: FilePayload[];
};

export type RefHeadPayload = {
  name: string;
  commit: { sha: string };
};

export type BranchListEntryPayload = {
  name: string;
  protected: boolean;
};

export type ComparePayload = {
  ahead_by: number;
  behind_by: number;
};

export type OpenPullPayload = {
  number: number;
  title: string;
  head: { ref: string; repo: { full_name: string } | null };
};

export type PullPayload = {
  number: number;
  html_url: string;
  title: string;
  state: string;
  merged_at: string | null;
  head: { ref: string; repo: { full_name: string } | null };
};

export type PullDetailPayload = {
  number: number;
  node_id?: string;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  draft?: boolean;
  merged?: boolean;
  user: { login: string } | null;
  base: { ref: string };
  head: { ref: string; sha: string };
  additions: number;
  deletions: number;
  changed_files: number;
  commits: number;
  comments: number;
  review_comments?: number;
  created_at: string;
  updated_at: string;
  mergeable: boolean | null;
  mergeable_state?: string;
  requested_reviewers?: { login: string }[];
};

export type TrackedPayload = {
  number: number;
  title: string;
  html_url: string;
  state: string;
  draft?: boolean;
  comments: number;
  updated_at: string;
  user: { login: string } | null;
  labels?: { name: string }[];
  pull_request?: { merged_at: string | null };
};

export type TrackedSearchPayload = {
  total_count: number;
  items: TrackedPayload[];
};

export type FilePayload = {
  filename: string;
  previous_filename?: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
};

export type ReviewPayload = {
  user: { login: string } | null;
  state: string;
  submitted_at?: string;
};

export type CheckRunPayload = {
  id?: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string | null;
  output?: {
    title?: string | null;
    summary?: string | null;
    text?: string | null;
  };
};

export type CheckRunsResponsePayload = {
  check_runs: CheckRunPayload[];
};

export type ReviewThreadsPayload = {
  data?: {
    repository: {
      pullRequest: {
        reviewThreads: {
          nodes: {
            isResolved: boolean;
            isOutdated: boolean;
            path: string;
            comments: { nodes: { body: string; author: { login: string } | null }[] };
          }[];
        };
      } | null;
    } | null;
  };
  errors?: { message: string }[];
};

export type UserProfilePayload = {
  id: number;
  login: string;
  name: string | null;
};

export type OAuthGrantPayload = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
};
