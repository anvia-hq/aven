# 0190: Open a PR asks GitHub about the branch

Status: accepted. Refines decision 0184.

## Context

`Open a PR` (0184) was offered when nothing was unshipped, the branch differed from the default
branch and Aven had no pull request recorded for the thread. Aven records only the pull requests
it finds by the thread's own branch name (`aven/<thread>`), so a thread that worked on a branch
that already had a pull request, such as one asked to review and fix an open pull request, got an
`Open a PR` button for a pull request that existed. A squash-merged branch, whose old merge base
keeps the diff from being empty, had the same fault.

## Decision

- The runner says which branch its workspace is on, in the answer to `diff.get` (an optional
  `branch`, null for a detached head), so the runner wire is unchanged.
- The control plane answers `GET /threads/:id/branch-pull-requests` for the thread's creator: it
  takes that branch, asks GitHub for the pull requests whose head is exactly it, in the project's
  repository, records them on the thread so the thread shows its chip, and returns them.
- The ship bar asks only when it would otherwise offer `Open a PR`. It offers it only when GitHub
  answers and has no pull request for the branch, open, closed or merged. While GitHub is being
  asked the slot holds its placeholder; when GitHub cannot be reached, or the branch is not known
  (an older runner, a detached head), nothing is offered, as a guess is worse than no button.
- A pull request found this way is recorded on the thread and stays; a thread's recorded pull
  requests are only ever added to.

## Consequences

- A thread that was working on an existing pull request shows that pull request, and no button.
- A runner older than this one never says its branch, so it never offers `Open a PR`; Ship, for
  unshipped work, is unaffected.
- One GitHub request is made when the bar is about to offer `Open a PR`, and again when a run
  starts or ends.
