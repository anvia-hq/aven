// A machine attached to the workspace to run agents on. Shared with every member; only its
// owner can revoke it. The connection token is never returned again after creation.
export type Runtime = {
  id: string;
  name: string;
  ownerId: string;
  /** Last characters of the token, to tell runtimes apart. */
  tokenHint: string;
  online: boolean;
  lastSeenAt: string | null;
  createdAt: string;
};

export type CreatedRuntime = { runtime: Runtime; token: string };
