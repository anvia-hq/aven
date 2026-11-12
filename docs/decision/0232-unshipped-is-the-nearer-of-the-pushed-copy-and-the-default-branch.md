# Unshipped is the nearer of the pushed copy and the default branch

Status: accepted. Replaces the rule of 0153 (an empty whole-branch diff empties the unshipped one) with a more general one.

## Context

A thread's unshipped changes were the working tree against the last pushed copy of its branch. 0153 added one case: when the whole branch (against its branch point from the default branch) adds nothing, nothing is unshipped. Both read the workspace's own `origin/<default>`, which in a folder project (0218) is a copy made when the thread was cloned and never refreshed. When the agent moved the branch to the folder's `main` another way (a fetch by path and a fast-forward), after a squash merge, the branch held 21 commits the pushed copy lacked and the stale `origin/main` made the whole branch look like 714 files: the badge showed `+31774 -482` for a one-file edit.

## Decision

- **The runner refreshes `origin/<default>` before it reads a thread's changes** (`refresh-base.ts`) when `origin` is a folder on the machine (a path or `file://`): a local fetch of that branch, ignored when it fails and cut at ten seconds. A project cloned from a server is not fetched from here, since that needs a token; `git_fetch` (0042) is how it is refreshed.
- **Unshipped is the smaller of two diffs**: the working tree against the pushed copy of the branch, and against the branch point from the default branch. Where the two agree on what has not left the thread (the common case) nothing changes; where the branch moved onto the default branch, or the pushed copy is older than it, the nearer base wins, so what is shown is what is new here.
- The whole-branch scope stays against the branch point, and the turn scope against the turn's mark.

## Consequences

- Squash-merging a pull request and syncing the folder no longer fills the badge with the merged work, and Ship does not offer to ship it.
- Each read of the unshipped scope takes two diffs and a local fetch, a few tens of milliseconds on a folder.
- When two bases give patches of equal size the pushed copy is used, as before.
