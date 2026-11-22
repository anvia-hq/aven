# Git Center is a runner-first repository and pull request control plane

Status: accepted. Builds on 0090. Decided 2026-11-22.

## Context

Earlier, Aven tried a read-only GitHub-only `/center` screen (0131, removed in 0291). Because it was read-only and never saw local runner checkouts, unmerged branches, or active agent workspaces, people still had to leave Aven for a desktop git client (such as GitKraken) to inspect multi-branch history, stage and commit changes, manage branches and worktrees, recover from reflog, or control pull requests and CI.

## Decision

- **Dedicated screen at `/git` and `/git/$projectId`** in the left rail, with GitKraken-style multi-project tabs persisted in `localStorage` and a shortcut from each project's page.
- **Runner-first with read-only GitHub fallback.** When a project's runner is online and supports the additive `git.*` calls (`git.snapshot`, `git.commitDiff`, `git.workspaceStatus`, `git.reflog`, `git.action`), Git Center runs in live mode with a full multi-branch `git log --all --topo-order` graph, working tree staging/commit/stash, branch and history operations, reflog recovery, and branch/worktree hygiene cleanup. When the runner is offline, outdated, or the project is GitHub-only, Git Center falls back cleanly to a read-only GitHub view without bumping `WIRE_VERSION`.
- **Unified project and thread workspaces.** Active threads for the project are overlaid directly onto the commit graph alongside synthetic WIP rows for dirty workspaces. Users can inspect or act on either the project repository or an idle thread workspace (blocked with `409` while an agent run is active).
- **Agent handoffs and GitHub PR controls.** Instead of a manual 3-way merge editor, conflict states surface a banner offering "Resolve with Agent" alongside Abort and Continue. The Pull Request inspector supports inline CI check log viewing, "Ask Agent to fix CI", reviews, branch updates, and merge/squash/rebase/enqueue authenticated with the person's own GitHub token.

## Consequences

- Older runners continue connecting without a wire version bump; the control plane detects `"Unknown call"` on `git.*` and shows a read-only banner prompting an update.
- Write actions on a runner are serialized per canonical `git-common-dir` to avoid `.git/index.lock` races, and credentials are passed only via in-memory environment configuration (`GIT_CONFIG_COUNT`), never written to disk.
