# Center filters, opens, and lists branches and history

Status: accepted. Builds on 0131 (Center), 0090 (the commit graph) and 0092 (pull requests and issues).

## Context

Center (0131) listed every project's open and closed pull requests and latest commits. To triage with it, a person needs to narrow the pull requests ("what needs my review?"), open one without leaving, read the history of one branch or file, and see where branches stand, as GitKraken shows.

## Decision

All of it is read from GitHub with the installation's read-only token and the person's own connected login where "me" is meant; nothing is written to GitHub.

- **Filters in the address.** The pull requests are narrowed by state (open, draft, merged, closed, any), author, requested reviewer, review status, checks, label, age (not changed for N days), words of the title and order, each one of GitHub's search qualifiers (`trackedQualifiers`; a login or a label is one token and words lose what would make a qualifier of their own). The values live in the page's search, so a view can be shared. **Quick views** are sets of those filters: Needs my review, Mine, Failing checks, Ready to merge, Stale.
- **Opening one.** `GET /projects/:id/pulls/:number` and `/commits/:sha` answer a pull request's description, reviewers, checks (the app's `checks: read`; without it, none) and up to a hundred files with their patches cut, or a commit's whole message and files. They open in a drawer, the diff drawn by the thread's diff reader.
- **History filters.** `GET /projects/:id/commits` takes `author`, `since`, `until`, `path` and `branch`, GitHub's own filters of a history, and the words of a message are found among the commits shown.
- **Branches.** `GET /projects/:id/branches` lists the default branch and the thirty most recently active, each with commits ahead and behind, its last commit and its open pull request (a pull request from a fork is not for our branch), marked stale after thirty days with none. Each branch costs GitHub two calls, so they are asked when a project is chosen and by Refresh, six at a time. Choosing a branch shows its history.
- **One place for each control.** The quick views are the page's tabs; each list has one Filters popover and a search in its own header, with what is on shown as chips under it that take it off. A project's branches are the other tab of its pull requests card. Each list scrolls inside its card. A filter typed into a field is kept when typing pauses, on Enter, on Escape and on leaving the field.
- **Tags** that name a commit are shown on it, and the commits of all the projects are grouped by the day they were made, each with its author's GitHub picture. A day filter is a date in UTC, so "Today" may start hours off the reader's own midnight.

## Consequences

Review status and checks as filters, and checks in a pull request's detail, depend on what the GitHub App may read; an app made before this lacks `checks: read` and shows none until its owner approves it. Search answers the first thousand matches. A repository with many branches is summarized up to thirty and says so. Merging, closing, commenting and creating branches are still not done here.
