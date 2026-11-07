/** How loaded a runner's machine was when it last said (decision 0091). */
export type RuntimeStats = {
  cores: number;
  /** Null when the machine cannot say. */
  cpuPercent: number | null;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  /** Containers running on it now. */
  sandboxes: number;
  reportedAt: string;
};

// A machine attached to the workspace to run agents on. Shared with every member; only its
// owner can revoke it. The connection token is never returned again after creation.
export type Runtime = {
  id: string;
  name: string;
  /** Null on the control plane's own built-in runner. */
  ownerId: string | null;
  /** Last characters of the token, to tell runtimes apart. */
  tokenHint: string;
  online: boolean;
  /** The release of `aven` the runner says it is; null when offline, or a runner that does not say. */
  build: string | null;
  /** The runner is on an older release than the server: run `aven update` on its machine. */
  outdated: boolean;
  /** The release its Update button takes it to: the server's, or a newer one for the control plane's own runner. */
  updateTo: string | null;
  /** An installed `aven` that can update itself when asked (decision 0146). */
  canUpdate: boolean;
  /** Null while offline, and for a runner that does not report its load (an older release). */
  stats: RuntimeStats | null;
  lastSeenAt: string | null;
  createdAt: string;
};

export type CreatedRuntime = { runtime: Runtime; token: string };
