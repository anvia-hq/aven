# A thread compares its changes with every branch it pushed

Status: accepted. Extends 0232.

## Context

0232 made the unshipped changes the smaller of the working tree against the branch's pushed copy and against its branch point. A thread often ships under another name than the one it works on: a stacked or follow-up pull request is pushed as `aven/<id>-<slug>` (0044, 0069) while the workspace stays on `aven/<id>`. The folder had the work, but the workspace only looked at the pushed copy of its own branch, which was from the start of the thread, and the folder's `main` had not seen the squash merge. The badge showed a merged pull request's 23 files for a clean working tree.

## Decision

- **The runner fetches every branch of the thread from the folder** along with its default branch: `aven/<id>` and `aven/<id>-*`, matched on the first eight characters of the thread id, never other threads' branches.
- **The unshipped changes are the smallest diff** against the pushed copies of those branches (the five newest) and the branch point. A branch that is not a thread's own (no `aven/<id>` name) uses its own pushed copy as before.
- **Other threads' branches never stand in for the default branch**: `origin/aven/*` refs are left out when the runner works out which remote branch is the default (`remote-base.ts`), as the current branch's own already was.

## Consequences

- A thread whose work sits in a pull request, pushed under any of its branch names, shows nothing unshipped until it changes again.
- The folder's other threads' branches are not fetched, so a folder with many threads does not cost the reader more.
