# A ship reaches GitHub from the folder, and watches the pull request

Status: accepted. Refines 0044 (shipping is an agent run) and 0218 (a runner serves folders).

## Context

In a folder project the thread's `origin` is the person's folder (0218), which holds the GitHub remote. The ship prompt said `git push -u origin HEAD` and `gh pr create`, so the agent pushed to the folder, found no GitHub remote, and stopped without a pull request until the person told it the folder had one. Its instructions forbid pushing outside the project folder unless asked, and nothing said that a ship request is that ask. The agent also ended at the pull request's URL, leaving CI, review comments and conflicts to the person.

## Decision

- **A folder project's ship prompt says `origin` is the folder** (`folder` in the prompt's context, from `projects.directory`): the agent finds the folder's GitHub remote with `git -C <folder> remote -v`, fetches the base from it, pushes the branch from the folder without forcing and runs `gh` from inside the folder. It is added after the repository's own `.aven/ship.md` too, not only to Aven's default.
- **Its instructions say a `<ship_request>` also asks for that push**, which is outside `/workspace`.
- **A ship does not end at the URL.** Aven's note, added after a repository's own prompt as well, tells the agent to start a background command (`exec_command` with `background: true`) that polls the pull request with `gh` and exits when checks finished, one failed, it was closed or merged or it conflicts, so the thread wakes (0071). It then reads every review comment on the latest commit, fixes what fails, pushes and watches again, says when it is mergeable (checks green, no comment unaddressed, no conflict) and never merges it.

## Consequences

- A repository's `.aven/ship.md` that says nothing about watching still gets the watch, and one that already does says it twice.
- The thread stays working while checks run, so its runner and machine stay busy until the pull request is mergeable or the person stops it.
