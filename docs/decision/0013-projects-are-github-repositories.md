# Projects are imported GitHub repositories

Status: accepted. Supersedes the part of 0010 that made a project only a name and a runner; builds on 0011 and 0012. Its "Clone only" bullet is superseded by 0040.

## Context

0010 gave every thread an empty sandbox workspace and said a repository would be attached later. A project that is only a name has nothing for the agent to work on.

## Decision

- **A project is one GitHub repository** plus the runner that hosts its threads' sandboxes. There is no "New project": a project exists only through **Import repository**. Projects keep their name (default: the repository name) and `runtime_id`.
- **GitHub App, not OAuth.** An organization connects an installation (`github_installations`); "Import repository" lists what that installation can see. The control plane holds the app's private key (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_SLUG`) and mints short-lived installation tokens. The installation is linked to the organization through a signed `state` that carries the organization and user.
- **A repository can be imported once per organization** (`projects_org_repo_idx`).
- **Each thread clones the repository on first use.** When the runner starts a thread's workspace and it has no `.git`, it asks the control plane for access over the runtime wire (`repo.access`, answered only for a live run of that thread) and clones the project's default branch into `/workspace`, then checks out a branch `aven/<first 8 of thread id>`. The token is passed per command (`http.extraHeader`), never written to `.git/config`, and the runner stores no GitHub credential. The runner needs `git`.
- **Clone only.** Nothing pushes, opens pull requests or writes to GitHub; the app needs read-only repository contents and metadata.
- Wire version 4.

## Consequences

- Migration 0013 makes the repository columns `NOT NULL`; existing projects (and their threads) must be removed first (0011).
- A thread keeps its clone after its container is released; a later run does not fetch.
- Pushing, pull requests and syncing a long-lived workspace with the remote are future work and will need a write-capable app permission.
- The runner machine needs `git` besides Docker.
