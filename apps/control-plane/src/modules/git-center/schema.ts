import { z } from "zod";

export const projectParams = z.object({
  projectId: z.string().uuid(),
});

export const commitParams = z.object({
  projectId: z.string().uuid(),
  sha: z.string().regex(/^[0-9a-f]{4,64}$/i),
});

export const pullParams = z.object({
  projectId: z.string().uuid(),
  number: z.coerce.number().int().positive(),
});

export const checkLogParams = z.object({
  projectId: z.string().uuid(),
  number: z.coerce.number().int().positive(),
  checkRunId: z.coerce.number().int().positive(),
});

export const snapshotQuery = z.object({
  page: z.coerce.number().int().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(10).max(300).optional(),
  branch: z.string().max(256).optional(),
  search: z.string().max(256).optional(),
  author: z.string().max(256).optional(),
  path: z.string().max(4096).optional(),
});

export const workspaceQuery = z.object({
  threadId: z.string().uuid().optional(),
  filePath: z.string().max(4096).optional(),
  staged: z
    .enum(["0", "1", "true", "false"])
    .transform((v) => v === "1" || v === "true")
    .optional(),
});

export const reflogQuery = z.object({
  threadId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const workspaceTarget = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("project") }),
  z.object({ kind: z.literal("thread"), threadId: z.string().uuid() }),
]);

const gitActionPayload = z.discriminatedUnion("op", [
  z.object({ op: z.literal("fetch"), prune: z.boolean().optional() }),
  z.object({
    op: z.literal("pull"),
    strategy: z.enum(["merge", "rebase", "ff-only"]).optional(),
  }),
  z.object({
    op: z.literal("push"),
    branch: z.string().min(1).max(256).optional(),
    forceWithLease: z.boolean().optional(),
    setUpstream: z.boolean().optional(),
  }),
  z.object({
    op: z.literal("checkout"),
    ref: z.string().min(1).max(256),
    createBranch: z.string().min(1).max(256).optional(),
  }),
  z.object({
    op: z.literal("branch.create"),
    name: z.string().min(1).max(256),
    startPoint: z.string().min(1).max(256).optional(),
    checkout: z.boolean().optional(),
  }),
  z.object({
    op: z.literal("branch.rename"),
    oldName: z.string().min(1).max(256),
    newName: z.string().min(1).max(256),
  }),
  z.object({
    op: z.literal("branch.delete"),
    name: z.string().min(1).max(256),
    force: z.boolean().optional(),
    deleteRemote: z.boolean().optional(),
  }),
  z.object({
    op: z.literal("stage"),
    paths: z.array(z.string().min(1).max(4096)).max(500).optional(),
    all: z.boolean().optional(),
  }),
  z.object({
    op: z.literal("unstage"),
    paths: z.array(z.string().min(1).max(4096)).max(500).optional(),
    all: z.boolean().optional(),
  }),
  z.object({
    op: z.literal("discard"),
    paths: z.array(z.string().min(1).max(4096)).max(500).optional(),
    all: z.boolean().optional(),
  }),
  z.object({
    op: z.literal("commit"),
    message: z.string().trim().min(1).max(10_000),
    amend: z.boolean().optional(),
    signoff: z.boolean().optional(),
  }),
  z.object({
    op: z.literal("stash.push"),
    message: z.string().max(500).optional(),
    includeUntracked: z.boolean().optional(),
  }),
  z.object({ op: z.literal("stash.apply"), index: z.number().int().min(0).max(500) }),
  z.object({ op: z.literal("stash.pop"), index: z.number().int().min(0).max(500) }),
  z.object({ op: z.literal("stash.drop"), index: z.number().int().min(0).max(500) }),
  z.object({
    op: z.literal("merge"),
    ref: z.string().min(1).max(256),
    noFf: z.boolean().optional(),
  }),
  z.object({ op: z.literal("rebase"), onto: z.string().min(1).max(256) }),
  z.object({ op: z.literal("cherryPick"), sha: z.string().regex(/^[0-9a-f]{4,64}$/i) }),
  z.object({ op: z.literal("revert"), sha: z.string().regex(/^[0-9a-f]{4,64}$/i) }),
  z.object({ op: z.literal("conflict.abort") }),
  z.object({ op: z.literal("conflict.continue") }),
  z.object({
    op: z.literal("reset"),
    ref: z.string().min(1).max(256),
    mode: z.enum(["soft", "mixed", "hard"]),
  }),
  z.object({ op: z.literal("worktree.prune") }),
  z.object({
    op: z.literal("worktree.remove"),
    path: z.string().min(1).max(4096),
    force: z.boolean().optional(),
  }),
  z.object({
    op: z.literal("branches.cleanup"),
    branches: z.array(z.string().min(1).max(256)).min(1).max(200),
    force: z.boolean().optional(),
  }),
]);

export const gitActionBody = z.object({
  target: workspaceTarget,
  action: gitActionPayload,
});

export const createPullBody = z.object({
  title: z.string().trim().min(1).max(256),
  body: z.string().max(30_000).optional(),
  head: z.string().min(1).max(256),
  base: z.string().min(1).max(256),
  draft: z.boolean().optional(),
});

export const reviewPullBody = z.object({
  event: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]),
  body: z.string().max(20_000).optional(),
});

export const mergePullBody = z.object({
  method: z.enum(["merge", "squash", "rebase", "enqueue"]),
  commitTitle: z.string().max(256).optional(),
  commitMessage: z.string().max(10_000).optional(),
});

export const updatePullStateBody = z.object({
  state: z.enum(["open", "closed"]),
});

export const handoffBody = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("start_from_ref"),
    ref: z.string().min(1).max(256),
    prompt: z.string().max(4000).optional(),
  }),
  z.object({
    kind: z.literal("resolve_conflicts"),
    threadId: z.string().uuid().optional(),
    operation: z.enum(["merge", "rebase", "cherry-pick", "revert"]),
    files: z.array(z.string().min(1).max(4096)).max(200),
  }),
  z.object({
    kind: z.literal("fix_ci"),
    pullNumber: z.number().int().positive(),
    branch: z.string().min(1).max(256),
    checkName: z.string().min(1).max(256),
    logSnippet: z.string().max(12_000).optional(),
  }),
]);

export type SnapshotQuery = z.infer<typeof snapshotQuery>;
export type WorkspaceQuery = z.infer<typeof workspaceQuery>;
export type ReflogQuery = z.infer<typeof reflogQuery>;
export type GitActionBody = z.infer<typeof gitActionBody>;
export type CreatePullBody = z.infer<typeof createPullBody>;
export type ReviewPullBody = z.infer<typeof reviewPullBody>;
export type MergePullBody = z.infer<typeof mergePullBody>;
export type UpdatePullStateBody = z.infer<typeof updatePullStateBody>;
export type HandoffBody = z.infer<typeof handoffBody>;
