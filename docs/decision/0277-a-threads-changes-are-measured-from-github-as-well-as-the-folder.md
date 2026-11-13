# 0277: A thread's changes are measured from GitHub's main as well as the folder's

Status: accepted. Builds on 0218 and 0231 (a thread is a clone of the project folder), 0273 (a pull in a thread fetches GitHub through the folder) and 0276 (the runner's own GitHub login).

## Context

A thread's `origin` is the project folder, and the folder is often behind its own GitHub, because nobody pulls there. The changes badge and the Open PR button measure the thread from its branch point with the folder's default branch. After "git pull" in a thread, which fetches GitHub (0273), the branch holds every commit GitHub has and the folder lacks. Against the folder's old `main` they all look like the thread's own work: a thread that changed nothing showed +25591 −746 and offered "Open PR".

## Decision

- **Fetch the folder's own `origin` too.** When the folder's `origin` is an `https://`, `ssh://`, `git@`, `file://` or absolute path address, `refreshBase` fetches the default branch from it into `refs/aven/upstream` in the thread, using the runner's own git and login, with no prompt and a 10 second limit. A failed fetch changes nothing.
- **Measure from the nearer base.** The whole branch and the unshipped scope take the smallest diff over the branch points with the folder's default branch and with `refs/aven/upstream`. A folder ahead of GitHub (local commits not pushed) still wins when it is nearer.
- **At most once a minute per thread.** The diff is read every few seconds while a run goes, and the fetch to GitHub is a network call.

## Consequences

- No change to the wire or to what a run does; only what the badge, the diff panel and the ship button see.
- A runner that cannot reach GitHub keeps today's behaviour, so the badge can still show pulled commits there.
- The address is read from the folder's `.git/config`. A folder whose `.git` is a file (a worktree) is skipped.
