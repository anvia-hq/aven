# The agent can fetch from GitHub, through the runner

Status: accepted. Builds on 0013 (the clone's read-only token), 0040 and 0041 (no GitHub credential in a sandbox).

## Context

A thread's workspace is a clone of one branch (0013) and the sandbox holds no GitHub credential, so inside it `git fetch`, `git pull` and `git checkout other-branch` fail on a private repository, and `gh` is installed but logged out. A long-lived thread cannot catch up with `main`, so its pull request drifts or conflicts, and the agent cannot look at a teammate's branch.

## Decision

- **A tool, `git_fetch`, takes an optional `branch`** (the project's default branch when left out) and brings it into the workspace as `origin/<branch>`. It changes nothing else: not the working tree, not the thread's branch. The agent then uses ordinary git in the sandbox: `git merge origin/main`, `git rebase origin/main`, `git checkout -b try origin/other`.
- **The runner does the fetch, on its host, not the container.** It asks the control plane for the repository's short-lived read-only token with `repo.access`, the call a run already makes to clone (0013), and fetches from the clone URL it is given, not from the workspace's `origin`, with an explicit refspec `+refs/heads/<branch>:refs/remotes/origin/<branch>`. The token travels in git's environment as for the clone, is never written to the workspace and never enters the container, and is redacted from errors.
- **The host's git is hardened as for a push (0040)**: hooks, the file system monitor and credential helpers off, no system or global configuration, plus no automatic maintenance, and objects are checked as they arrive. The helper is shared with the push.
- **The branch name is checked**: a plain ref name (letters, digits, `.`, `_`, `-`, `/`), no `..`, nothing that starts with `-` or `/`. One branch per call, tags are not fetched, and nothing is pruned.
- **Only a repository's own default branch or another branch of it** can be fetched; the clone URL comes from the control plane, so the agent cannot point the fetch elsewhere.
- **No `git push`, no `gh`, no write token for the agent.** Shipping stays the person's button (0040, 0041).

## Consequences

- The agent can bring a thread up to date with `main` and resolve conflicts before the person ships.
- A fetch needs the runner to reach GitHub, which the sandbox might not; a failure says why in words (the runner's own message, token removed).
- The fetched objects are written by the runner's user into the workspace the container mounts, as the clone's are.
- Wire version unchanged: the call is `repo.access`, which already exists, and the tool runs inside a run.
