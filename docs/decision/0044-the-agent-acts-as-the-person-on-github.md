# The agent acts as the person on GitHub, and shipping is an agent run

Status: accepted; 0069 changes its one-pull-request-per-thread parts. Supersedes 0042 (the agent fetches through the runner) once `gh` is signed in, and the fixed pipeline of 0040 and 0041 as the way to ship; the connection of a person's GitHub account in 0041 stands and is what this builds on. Follows Amp, whose orbs have `gh` "preinstalled and signed in" and push "as you".

## Context

0040 to 0042 kept every GitHub credential out of the sandbox: the runner pushed and fetched, the control plane opened pull requests, and the agent had a `git_fetch` tool. That is safe and narrow: the agent cannot see CI, read review comments, open an issue or follow a team's own shipping steps. A repository's way of shipping (a PR template, a merge queue, a release script) cannot be a fixed pipeline.

## Decision

- **A run acts as the person who sent the message, on GitHub, with their own token.** The control plane gives the runner the sender's GitHub user token and who they are (`github` on `run.start` and `run.resume`, wire version 18), renewed first when it has less than two hours left, since GitHub cannot extend one and a run can last hours. A person who has not connected GitHub, or a GitHub that cannot be reached, gives a run with none: it goes on without GitHub.
- **The runner holds it in memory only.** It is not in the run's record or the journal, so it is not on the runner's disk outside the container. A run taken up after a runner restart has none until the next message.
- **The runner signs `gh` and `git` in inside the thread's container at the start of each run**: `gh`'s own configuration for the token, git's credential helper pointing at `gh`, and `user.name` and `user.email` set to the person's GitHub name and `<id>+<login>@users.noreply.github.com`. Because the sign-in is rewritten at each run, a long-lived container never holds a token that has expired.
- **What this lets the agent do is whatever the person can do through the app**: the app's permissions (contents and pull requests write, and actions, checks and commit statuses read, so the agent can see CI) and the person's own rights, on every repository the app and they share. It cannot be narrowed to one repository, which GitHub only allows for the app's own token. This is the trade-off Amp makes, accepted here.
- **Not in a setup container, a snapshot or a committed image**: the setup container (0043) never gets the token, and the workspace copy a snapshot keeps holds no credential; the token is in the thread's container only.
- **Shipping is a run of the agent.** The Ship button starts a run in the thread with a prompt: the repository's `.aven/ship.md` when it has one, else a default (commit, rebase onto the default branch, run the checks, push the thread's branch, open a pull request with `gh`). The agent does the work with `gh` and `git`; what the Ship button, the line count and the pull request link show stays. `.aven/ship.md` is read from the workspace at the time, and `/setup-ship` helps write it.
- **`git_fetch` stays for now**, as the way to read a branch for a person who has not connected GitHub, through the runner's read-only token.

## Consequences

- A prompt injected into something the agent reads (an issue, a review comment, a CI log, a file) can steer it to act as the person: push, merge, comment. The guard is the person watching the thread and the app's narrow permissions (no admin, no settings), not the sandbox.
- The fixed pipeline (`repo.push`, `publish-branch`, the model-written pull request text and the control plane's own pull request) is gone: the agent run replaced it. The wire version was not lowered when `repo.push` went.
- A person has to have connected GitHub for the agent to use it; `gh` in the sandbox says it is not logged in otherwise, and the agent's instructions say what to ask.
- Tokens are sent to the runner on the connection a runtime already holds; a runner is trusted with them as it is with provider keys' grants.
