# The project page shows the commit history

Status: accepted. Builds on 0082 (the project page reads the repository from GitHub) and 0013 (an installation's read-only token).

## Context

A project's page lists the repository's files and its README (0082), but not what changed in it. The person asked for the commit history there, ten to a page.

## Decision

- **`GET /projects/:id/commits?page=` gives one page of the default branch's commits**, newest first, ten to a page: `{ commits: [{ sha, message, author, date }], hasMore, page }`. It is read with the installation's read-only token like the files and the README, so it needs no runner and no clone. `message` is the first line, cut to 200 characters; `author` is the name on the commit, else the GitHub login.
- **`hasMore` is GitHub's own `next` link**, not a guess from a full page, so a history whose length is a multiple of ten does not offer an empty last page. A repository with no commit (GitHub answers 409) is an empty page, and one the installation no longer sees is a 404, as for the files.
- **The page is a card, Commits, in the side column**, under the environment variables, with Newer and Older buttons and the page number. A commit's short SHA links to it on GitHub; the app shows the history, not each change, as it shows folders and not files. The page number is the card's own state, not the address, and starts again at the newest when another project is opened.
- **The whole repository's history, not the folder's**: the card does not follow the folder being browsed.

## Consequences

- Each page is one GitHub API request and nothing is cached, as for the files; a project page left open does not refresh by itself.
- Only the default branch is shown. A thread's branch has its commits on GitHub, or in its Changes panel, until it is merged.
- The newest page moves as people push, so Older after a push can repeat a commit that the first page showed.
