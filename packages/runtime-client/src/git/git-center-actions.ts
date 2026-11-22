import { rm } from "node:fs/promises";
import { resolve } from "node:path";

import type { GitActionAuth, GitActionPayload, GitActionResult } from "@aven/protocol/types";

import { gitFailure } from "./host-git";
import {
  assertRelativeRepoPath,
  assertSafeRef,
  assertSafeRevision,
  assertSafeSha,
  detectConflictState,
  resolveGitCommonDir,
  resolveRepoRoot,
  runCenterGit,
  runCenterNetworkGit,
} from "./git-center";

const repoQueues = new Map<string, Promise<unknown>>();

function serializeRepo<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = repoQueues.get(key) ?? Promise.resolve();
  const next = previous.then(task);
  const cleanup = next
    .catch(() => undefined)
    .finally(() => {
      if (repoQueues.get(key) === cleanup) repoQueues.delete(key);
    });
  repoQueues.set(key, cleanup);
  return next;
}

async function conflictedPaths(root: string): Promise<string[]> {
  const out = await runCenterGit(root, ["diff", "--name-only", "--diff-filter=U"]);

  if (out.code !== 0) return [];

  return out.stdout.split("\n").flatMap((line) => {
    const trimmed = line.trim();
    return trimmed ? [trimmed] : [];
  });
}

async function ensureAuthorArgs(root: string, auth?: GitActionAuth): Promise<string[]> {
  const [nameOut, emailOut] = await Promise.all([
    runCenterGit(root, ["config", "--get", "user.name"]),
    runCenterGit(root, ["config", "--get", "user.email"]),
  ]);
  const extra: string[] = [];

  if (nameOut.code !== 0 || !nameOut.stdout.trim()) {
    const fallbackName = auth?.name?.trim() || auth?.login || "Aven User";
    extra.push("-c", `user.name=${fallbackName}`);
  }

  if (emailOut.code !== 0 || !emailOut.stdout.trim()) {
    const fallbackEmail = auth?.login
      ? `${auth.login}@users.noreply.github.com`
      : "aven@users.noreply.github.com";
    extra.push("-c", `user.email=${fallbackEmail}`);
  }

  return extra;
}

async function assertValidBranchName(root: string, name: string) {
  const safe = assertSafeRef(name, "branch name");
  const check = await runCenterGit(root, ["check-ref-format", "--branch", safe]);

  if (check.code !== 0) throw new Error(`Invalid branch name: ${name}`);

  return safe;
}

async function runConflictAwareOp(
  root: string,
  args: string[],
  label: string,
  auth?: GitActionAuth,
): Promise<GitActionResult> {
  const authorArgs = await ensureAuthorArgs(root, auth);
  const out = await runCenterGit(root, [...authorArgs, ...args], { auth });

  if (out.code === 0) {
    return {
      ok: true,
      summary: label,
      output: (out.stdout || out.stderr).trim().slice(0, 2000),
    };
  }

  const files = await conflictedPaths(root);
  const conflicts = await detectConflictState(root, files);

  if (conflicts) {
    return {
      ok: false,
      summary: `${label} stopped with conflicts in ${conflicts.files.length} file(s)`,
      conflicts,
      output: (out.stderr || out.stdout).trim().slice(0, 2000),
    };
  }

  throw gitFailure(label, out, auth?.token);
}

async function executeAction(
  root: string,
  action: GitActionPayload,
  auth?: GitActionAuth,
): Promise<GitActionResult> {
  switch (action.op) {
    case "fetch": {
      const args = ["fetch", "--all", "--tags"];

      if (action.prune !== false) args.push("--prune");

      const out = await runCenterNetworkGit(root, args, auth);

      if (out.code !== 0) throw gitFailure("Fetch failed", out, auth?.token);

      return { ok: true, summary: "Fetched latest changes from remotes" };
    }

    case "pull": {
      const args = ["pull"];

      if (action.strategy === "rebase") args.push("--rebase");
      else if (action.strategy === "ff-only") args.push("--ff-only");

      const authorArgs = await ensureAuthorArgs(root, auth);
      const out = await runCenterNetworkGit(root, [...authorArgs, ...args], auth);

      if (out.code === 0) {
        return {
          ok: true,
          summary: "Pulled changes from upstream",
          output: (out.stdout || out.stderr).trim().slice(0, 2000),
        };
      }

      const files = await conflictedPaths(root);
      const conflicts = await detectConflictState(root, files);

      if (conflicts) {
        return {
          ok: false,
          summary: `Pull stopped with conflicts in ${conflicts.files.length} file(s)`,
          conflicts,
          output: (out.stderr || out.stdout).trim().slice(0, 2000),
        };
      }

      throw gitFailure("Pull failed", out, auth?.token);
    }

    case "push": {
      const args = ["push"];

      if (action.forceWithLease) args.push("--force-with-lease");

      if (action.setUpstream) {
        args.push("-u", "origin");

        if (action.branch) {
          args.push(assertSafeRef(action.branch, "branch"));
        } else {
          args.push("HEAD");
        }
      } else if (action.branch) {
        args.push("origin", assertSafeRef(action.branch, "branch"));
      }

      const out = await runCenterNetworkGit(root, args, auth);

      if (out.code !== 0) throw gitFailure("Push failed", out, auth?.token);

      return {
        ok: true,
        summary: action.forceWithLease ? "Force-pushed branch safely" : "Pushed to remote",
        output: (out.stderr || out.stdout).trim().slice(0, 2000),
      };
    }

    case "checkout": {
      const ref = assertSafeRevision(action.ref, "ref");
      const args = action.createBranch
        ? ["checkout", "-b", await assertValidBranchName(root, action.createBranch), ref]
        : ["checkout", ref];
      const out = await runCenterGit(root, args);

      if (out.code !== 0) throw gitFailure("Checkout failed", out);

      return {
        ok: true,
        summary: action.createBranch
          ? `Created and switched to ${action.createBranch}`
          : `Switched to ${ref}`,
      };
    }

    case "branch.create": {
      const name = await assertValidBranchName(root, action.name);
      const start = action.startPoint
        ? assertSafeRevision(action.startPoint, "start point")
        : undefined;
      const args = action.checkout ? ["checkout", "-b", name] : ["branch", name];

      if (start) args.push(start);

      const out = await runCenterGit(root, args);

      if (out.code !== 0) throw gitFailure("Could not create branch", out);

      return {
        ok: true,
        summary: action.checkout ? `Created and switched to ${name}` : `Created branch ${name}`,
      };
    }

    case "branch.rename": {
      const oldName = assertSafeRef(action.oldName, "branch");
      const newName = await assertValidBranchName(root, action.newName);
      const out = await runCenterGit(root, ["branch", "-m", oldName, newName]);

      if (out.code !== 0) throw gitFailure("Could not rename branch", out);

      return { ok: true, summary: `Renamed ${oldName} to ${newName}` };
    }

    case "branch.delete": {
      const name = assertSafeRef(action.name, "branch");

      if (action.deleteRemote) {
        const remoteOut = await runCenterNetworkGit(
          root,
          ["push", "origin", "--delete", name],
          auth,
        );

        if (remoteOut.code !== 0)
          throw gitFailure("Could not delete remote branch", remoteOut, auth?.token);

        return { ok: true, summary: `Deleted remote branch origin/${name}` };
      }

      const flag = action.force ? "-D" : "-d";
      const out = await runCenterGit(root, ["branch", flag, name]);

      if (out.code !== 0) throw gitFailure("Could not delete branch", out);

      return { ok: true, summary: `Deleted branch ${name}` };
    }

    case "stage": {
      const args = action.all
        ? ["add", "-A"]
        : ["add", "--", ...(action.paths ?? []).map((p) => assertRelativeRepoPath(root, p))];

      if (!action.all && (!action.paths || action.paths.length === 0)) {
        throw new Error("No paths provided to stage");
      }

      const out = await runCenterGit(root, args);

      if (out.code !== 0) throw gitFailure("Could not stage files", out);

      return {
        ok: true,
        summary: action.all ? "Staged all changes" : `Staged ${action.paths?.length ?? 0} file(s)`,
      };
    }

    case "unstage": {
      const hasHead = (await runCenterGit(root, ["rev-parse", "--verify", "HEAD"])).code === 0;

      if (action.all) {
        const args = hasHead ? ["reset", "HEAD"] : ["rm", "--cached", "-r", "."];
        const out = await runCenterGit(root, args);

        if (out.code !== 0) throw gitFailure("Could not unstage files", out);

        return { ok: true, summary: "Unstaged all changes" };
      }

      if (!action.paths || action.paths.length === 0) {
        throw new Error("No paths provided to unstage");
      }

      const safePaths = action.paths.map((p) => assertRelativeRepoPath(root, p));
      const args = hasHead
        ? ["reset", "HEAD", "--", ...safePaths]
        : ["rm", "--cached", "--", ...safePaths];
      const out = await runCenterGit(root, args);

      if (out.code !== 0) throw gitFailure("Could not unstage files", out);

      return { ok: true, summary: `Unstaged ${safePaths.length} file(s)` };
    }

    case "discard": {
      if (action.all) {
        const checkout = await runCenterGit(root, ["checkout", "--", "."]);

        if (checkout.code !== 0) throw gitFailure("Could not discard changes", checkout);

        const clean = await runCenterGit(root, ["clean", "-fd"]);

        if (clean.code !== 0) throw gitFailure("Could not clean untracked files", clean);

        return { ok: true, summary: "Discarded all unstaged changes" };
      }

      if (!action.paths || action.paths.length === 0) {
        throw new Error("No paths provided to discard");
      }

      const safePaths = action.paths.map((p) => assertRelativeRepoPath(root, p));
      const trackedOut = await runCenterGit(root, ["ls-files", "--", ...safePaths]);
      const trackedSet = new Set(
        trackedOut.stdout.split("\n").flatMap((line) => {
          const trimmed = line.trim();
          return trimmed ? [trimmed] : [];
        }),
      );
      const tracked = safePaths.filter((p) => trackedSet.has(p));
      const untracked = safePaths.filter((p) => !trackedSet.has(p));

      if (tracked.length > 0) {
        const out = await runCenterGit(root, ["checkout", "--", ...tracked]);

        if (out.code !== 0) throw gitFailure("Could not discard tracked files", out);
      }

      for (const file of untracked) {
        await rm(resolve(root, file), { recursive: true, force: true });
      }

      return { ok: true, summary: `Discarded changes in ${safePaths.length} file(s)` };
    }

    case "commit": {
      const message = action.message.trim();

      if (!message) throw new Error("Commit message cannot be empty");

      const authorArgs = await ensureAuthorArgs(root, auth);
      const args = [...authorArgs, "commit", "-m", message];

      if (action.amend) args.push("--amend");

      if (action.signoff) args.push("-s");

      const out = await runCenterGit(root, args, { auth });

      if (out.code !== 0) throw gitFailure("Commit failed", out);

      return {
        ok: true,
        summary: action.amend ? "Amended latest commit" : "Created commit",
        output: out.stdout.trim().slice(0, 2000),
      };
    }

    case "stash.push": {
      const args = ["stash", "push"];

      if (action.includeUntracked) args.push("-u");

      if (action.message?.trim()) args.push("-m", action.message.trim());

      const out = await runCenterGit(root, args);

      if (out.code !== 0) throw gitFailure("Stash failed", out);

      return { ok: true, summary: "Saved working tree to stash" };
    }

    case "stash.apply": {
      const ref = `stash@{${Math.max(0, Math.trunc(action.index))}}`;
      return runConflictAwareOp(root, ["stash", "apply", ref], `Apply ${ref}`, auth);
    }

    case "stash.pop": {
      const ref = `stash@{${Math.max(0, Math.trunc(action.index))}}`;
      return runConflictAwareOp(root, ["stash", "pop", ref], `Pop ${ref}`, auth);
    }

    case "stash.drop": {
      const ref = `stash@{${Math.max(0, Math.trunc(action.index))}}`;
      const out = await runCenterGit(root, ["stash", "drop", ref]);

      if (out.code !== 0) throw gitFailure("Could not drop stash", out);

      return { ok: true, summary: `Dropped ${ref}` };
    }

    case "merge": {
      const ref = assertSafeRevision(action.ref, "merge ref");
      const args = action.noFf ? ["merge", "--no-ff", ref] : ["merge", ref];
      return runConflictAwareOp(root, args, `Merge ${ref}`, auth);
    }

    case "rebase": {
      const onto = assertSafeRevision(action.onto, "rebase target");
      return runConflictAwareOp(root, ["rebase", onto], `Rebase onto ${onto}`, auth);
    }

    case "cherryPick": {
      const sha = assertSafeSha(action.sha);
      return runConflictAwareOp(root, ["cherry-pick", sha], `Cherry-pick ${sha.slice(0, 7)}`, auth);
    }

    case "revert": {
      const sha = assertSafeSha(action.sha);
      return runConflictAwareOp(
        root,
        ["revert", "--no-edit", sha],
        `Revert ${sha.slice(0, 7)}`,
        auth,
      );
    }

    case "conflict.abort": {
      const state = await detectConflictState(root, await conflictedPaths(root));

      if (!state) return { ok: true, summary: "No active conflict to abort" };

      const out = await runCenterGit(root, [state.operation, "--abort"]);

      if (out.code !== 0) throw gitFailure(`Could not abort ${state.operation}`, out);

      return { ok: true, summary: `Aborted ${state.operation}` };
    }

    case "conflict.continue": {
      const state = await detectConflictState(root, await conflictedPaths(root));

      if (!state) return { ok: true, summary: "No active operation to continue" };

      return runConflictAwareOp(
        root,
        [state.operation, "--continue"],
        `Continue ${state.operation}`,
        auth,
      );
    }

    case "reset": {
      const ref = assertSafeRevision(action.ref, "reset ref");
      const out = await runCenterGit(root, ["reset", `--${action.mode}`, ref]);

      if (out.code !== 0) throw gitFailure("Reset failed", out);

      return { ok: true, summary: `Reset (${action.mode}) to ${ref}` };
    }

    case "worktree.prune": {
      const out = await runCenterGit(root, ["worktree", "prune"]);

      if (out.code !== 0) throw gitFailure("Could not prune worktrees", out);

      return { ok: true, summary: "Pruned stale worktree metadata" };
    }

    case "worktree.remove": {
      const listed = await runCenterGit(root, ["worktree", "list", "--porcelain"]);

      if (listed.code !== 0) throw gitFailure("Could not list worktrees", listed);

      const registered = listed.stdout
        .split("\n")
        .flatMap((line) =>
          line.startsWith("worktree ") ? [line.slice("worktree ".length).trim()] : [],
        );

      if (action.path === root || !registered.includes(action.path)) {
        throw new Error("Target is not a removable linked worktree");
      }

      const args = action.force
        ? ["worktree", "remove", "--force", action.path]
        : ["worktree", "remove", action.path];
      const out = await runCenterGit(root, args);

      if (out.code !== 0) throw gitFailure("Could not remove worktree", out);

      return { ok: true, summary: `Removed worktree ${action.path}` };
    }

    case "branches.cleanup": {
      const currentOut = await runCenterGit(root, ["symbolic-ref", "--short", "HEAD"]);
      const current = currentOut.code === 0 ? currentOut.stdout.trim() : null;
      const flag = action.force ? "-D" : "-d";
      const deleted: string[] = [];

      for (const raw of action.branches) {
        const name = assertSafeRef(raw, "branch");

        if (name === current || name === "main" || name === "master") continue;

        const out = await runCenterGit(root, ["branch", flag, name]);

        if (out.code === 0) deleted.push(name);
      }

      return { ok: true, summary: `Deleted ${deleted.length} branch(es)` };
    }
  }
}

export async function runGitAction(
  workspaceRoot: string,
  action: GitActionPayload,
  auth?: GitActionAuth,
): Promise<GitActionResult> {
  const root = await resolveRepoRoot(workspaceRoot);

  if (!root) throw new Error("Not a git repository");

  const lockKey = (await resolveGitCommonDir(root)) ?? root;
  return serializeRepo(lockKey, () => executeAction(root, action, auth));
}
