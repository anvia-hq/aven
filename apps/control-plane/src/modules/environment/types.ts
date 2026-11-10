import type { RepoAccess } from "@aven/protocol/types";

export type SnapshotState = {
  state: "idle" | "running";
  startedAt?: string;
  savedAt?: string;
  error?: string;
  failedAt?: string;
};

export type EnvironmentDeps = {
  repoAccess: (threadId: string) => Promise<RepoAccess>;
  now?: () => Date;
};
