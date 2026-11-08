# 0153: Nothing is unshipped when the branch adds nothing to the default branch

Status: accepted. Refines the unshipped scope of the thread diff.

## Context

A thread's "unshipped" changes are what its working tree has beyond the last pushed copy of its own branch. After `git pull --rebase origin main`, the branch holds everything new on `main` while the pushed copy is older, so the changes badge showed hundreds of files that `main` already has, and the Ship button did not count the thread as up to date.

## Decision

- The unshipped diff is empty when the whole-branch diff (against the branch point from the default branch) is empty.
- Otherwise it is unchanged: the working tree against the pushed copy, or against the branch point when the branch was never pushed.

## Consequences

- Pulling or rebasing onto `main` no longer shows other people's work as unshipped.
- A branch that is behind a pushed copy with real changes still shows the pushed copy's difference as before.
