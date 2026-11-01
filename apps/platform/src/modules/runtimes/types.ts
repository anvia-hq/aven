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
  lastSeenAt: string | null;
  createdAt: string;
};

export type CreatedRuntime = { runtime: Runtime; token: string };
