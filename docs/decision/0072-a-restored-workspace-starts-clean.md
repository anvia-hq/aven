# A workspace restored from a snapshot starts with no untracked files

Status: accepted. Amends 0043 (environments: setup script and snapshots), which said untracked files stay when a restored workspace is brought up to date.

## Context

A snapshot holds a copy of the workspace of the thread that made it. When that thread had written files the repository does not have yet, such as the `.aven/setup`, `.aven/resume` and `README.md` of a `/setup-env` thread whose pull request was not merged, they went into the snapshot. A later thread restored it, reset its branch to `origin/<default>` (`checkout -f -B`, which leaves untracked files alone) and so started with those files untracked. The Changes panel and the Ship button's line count showed them as the new thread's work (+129 -0 before it had done anything), and its pull request would have included them.

Amp's orbs avoid this by what a snapshot holds: "the repository and anything changed by `.agents/setup`", saved when setup ends, before any agent work. Aven's `save_environment` runs setup in a fresh container but over the thread's workspace, so the thread's own uncommitted files are part of it.

## Decision

- **After a restore, `updateRestoredWorkspace` runs `git clean -f -d`** (through `hostGit`, without `-x`). Untracked files that git does not ignore are removed. Files `.gitignore` or the clone's `.git/info/exclude` ignore stay: `node_modules`, caches, the package stores of `local-excludes.ts`, and anything else setup made that the repository ignores.
- A failing clean fails the restore, which falls back to a clone and a new setup, as any other restore failure does (0043).

## Consequences

- A thread restored from a snapshot starts with an empty diff, whatever the snapshot's thread left behind.
- Output of setup that the repository does not ignore (a `dist/` that is tracked nowhere and not in `.gitignore`) is not kept by the snapshot any more. It would have shown up as a change of every thread, so a setup that builds something should have it ignored.
- A thread cannot rely on `.aven/setup`, `.aven/resume` or `.aven/skills` it finds in a snapshot's workspace: they are there only when the repository has them on its default branch.
- Not done: taking the snapshot from a clean clone plus setup, as Amp does. It would also keep the agent's files out of the snapshot, at the cost of a second copy of the repository in setup.
