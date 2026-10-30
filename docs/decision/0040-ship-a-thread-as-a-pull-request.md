# A person ships a thread as a pull request

Status: accepted. Supersedes the "Clone only" bullet of 0013; the rest of 0013 stands. Builds on 0010 (a sandbox per thread) and 0012 (the agent's tools act inside the container).

## Context

0013 made a thread clone its project's repository onto branch `aven/<id8>` and said nothing pushes or opens pull requests. The work of a thread therefore stays on the runner. Other cloud agents let the person publish it from the UI (Claude Code on the web, Cursor); the ones that put a GitHub token in the VM see pushes work and pull-request calls fail when the token is not allowed to write pull requests.

## Decision

- **A Ship button on the thread publishes it as a pull request.** The agent never pushes and never talks to GitHub: no GitHub credential enters a sandbox, and `gh` in the image stays unauthenticated. The pipeline is fixed and owned by Aven.
- **The control plane orchestrates.** `POST /threads/:id/ship` (member of the thread's organization) asks the thread's runner to commit and push, then opens the pull request with the GitHub App's installation token, or updates the one already open for the branch. It stores `pr_number` and `pr_url` on the thread.
- **The runner pushes, with a token it is handed for that one request.** A new runner call, `repo.push`, carries a write token scoped to the thread's repository (`contents: write`), the clone URL, the branch, the commit message and the author. The runner commits any uncommitted changes and pushes `aven/<id8>` to the same name, never forced. The token is passed as git does for the clone (`http.extraHeader` through the environment, 0013): never in `.git/config`, never in the container, redacted from errors. The runner still stores no GitHub credential.
- **The runner's git calls on the workspace are hardened.** The agent writes the workspace's `.git`, and these calls run on the runner's host with a token: they run with `core.hooksPath=/dev/null` and `core.fsmonitor=false`, with the system and global git configuration off.
- **Only the thread's own branch is pushed.** The branch is `threadBranch(threadId)`, computed by the control plane, not taken from the request.
- **Pull requests are drafts by default.** Title and body come first from the diff and the thread's first prompt; a later step has a short ship run of the agent write them with a `propose_pull_request` tool that only returns text.
- **The GitHub App needs `contents: write` and `pull_requests: write`.** Installations created before this ask GitHub's owner to approve the new permissions; until then the control plane answers the ship with a 409 that says so, and read-only clone tokens keep working. Reads keep using read-only tokens.
- **Out of scope:** merging, CI status, answering review comments, auto-fix of failing checks.

## Consequences

- A leaked clone token still cannot write; a push token is minted per ship, limited to the one repository, and held by the runner only while it pushes (GitHub itself keeps it valid for up to an hour, so it is never cached or logged).
- Re-shipping after more work is a fast-forward push to the same branch and updates the same pull request.
- Wire version 17: runners and control planes must be upgraded together.
- Organizations must approve the app's new permissions before the first ship.
