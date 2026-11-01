# A thread can open more than one pull request

Status: accepted. Changes the parts of 0044 that tie a thread to one pull request (the single `pull_request_*` pair on `threads`, and a ship prompt that never opens a second one); the rest of 0044 stands. Follows Amp, whose Ship asks the agent to name a branch and open a pull request, and whose custom prompts are free to choose.

## Context

A thread's branch was fixed at `aven/<id prefix>` when its workspace was cloned. The default ship prompt told the agent that a push to that branch updates the pull request, "do not open another", the thread kept one pull request number and URL, the sync stopped looking once it had one, and the button became "Update PR". Work that had nothing to do with the open pull request, or came after it was merged, could only be pushed to the same branch.

## Decision

- **A thread has many pull requests.** A table `thread_pull_requests` (thread, number, URL, head branch, title, state `open`/`closed`/`merged`) replaces `threads.pull_request_number` and `pull_request_url`; the existing pair is copied into it. A thread as clients see it carries `pullRequests`, newest first.
- **A thread's branches start with its prefix.** The first is still `aven/<id prefix>`; any further one is `aven/<id prefix>-<short-slug>`. That is how Aven finds the pull requests of a thread without the agent telling it: after every run it reads the repository's newest hundred pull requests and keeps those whose head is in the repository itself (not a fork) and is the prefix or starts with `<prefix>-`, adding new ones and bringing the title and state of known ones up to date. A pull request that falls out of the newest hundred keeps the state it last had.
- **Ship takes a mode.** `POST /threads/:id/ship` takes `mode`: `update` pushes the branch that is checked out and updates its open pull request; `new` opens a separate pull request for the work that does not belong to an earlier one, on a new branch from the default branch. Without a mode, the newest pull request decides: `update` while it is open, `new` otherwise (none yet, merged or closed).
- **The prompt says what exists.** Whichever prompt is sent, the repository's own `.aven/ship.md` or the default, is followed by the thread's pull requests with the state Aven last saw, the mode, and the branch naming rule. The state may be stale, so the agent is told to check with `gh` before relying on it.
- **The web client** says Update PR while the newest pull request is open and New PR once it is merged or closed, and a menu beside the button offers "Ship as a new PR" (while one is open) and links to every pull request of the thread.

## Consequences

- Which changes belong to the new pull request is the agent's call (or the person's, who it asks): it carries them to the new branch with git. If it does not, the new pull request holds everything.
- The sync costs a token and a listing after every run, not only until the first pull request.
- A merge on GitHub is seen after the thread's next run, not when it happens.
- A repository's `.aven/ship.md` that never mentions a second pull request still gets the rule appended, so it need not change.
