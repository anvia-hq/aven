# 0253: A folder is fetched before a thread starts from it

Status: accepted. Refines 0218 (a thread works in its own clone of the project's folder) and 0252.

## Context

A thread's `origin` is the project's folder (0218), and the folder's own `main` moves only when its owner pulls. A folder nobody pulls on, such as a checkout on a server, kept every new thread on an old commit: the agent fetched, was told `main` had nothing new, and worked on code that was several pull requests behind (it could not find a page that had been merged the day before).

## Decision

- **Before it makes a thread's clone, the runner runs `git fetch --prune origin` in the folder.** This changes only the folder's remote-tracking refs, never its branch, index or files. A folder under the runner's own `repos/` (0252) is also fast-forwarded, as before. A fetch that fails (offline, no `origin`, no sign-in) is ignored and the thread starts from the folder as it is.
- **The thread starts from the fetched remote branch when it is ahead of the folder's branch.** After the clone, the thread fetches the folder's `refs/remotes/origin/<branch>` as `refs/remotes/github/<branch>` and, if the clone's commit is an ancestor of it, resets the thread's own new branch to it (nothing is lost: the branch has no work yet).
- **The thread's `origin` fetches the folder's remote-tracking branches as `github/*`**, so `git fetch` in the thread shows what GitHub had when the folder was last fetched, and the agent can read `github/main`.

## Consequences

- A thread's start takes as long as the fetch (a few seconds at most; a minute at the limit).
- The person's own checkout gets a new `FETCH_HEAD` and remote-tracking refs and nothing else.
- A thread's `git fetch` still asks the folder, so it is as fresh as the folder's last fetch, which is the thread's start or the next thread's.

## Not verified

A folder whose remote needs an ssh passphrase, and one with a remote that is not GitHub.
