# The project page lists pull requests and issues

Status: accepted. Builds on 0082 and 0089 (the project page reads the repository from GitHub with the installation's read-only token) and 0074 (the app's permissions).

## Context

A project's page shows the files, the README and the commits, but not what is in flight: the pull requests and issues that are open, and what became of the others. The person asked to see them with their status.

## Decision

- **`GET /projects/:id/pulls` and `GET /projects/:id/issues`** each give one page, ten to a page, of the repository's pull requests or issues, the latest changed first: `{ items: [{ number, title, url, author, status, comments, updatedAt }], total, hasMore, page }`, with `?state=open|closed` (open by default) and `?page=`. They are read with the installation's token like the commits, so they need no runner and no clone; another organization's project, or a repository the installation no longer sees, is a 404.
- **`status`** is what a person reads on GitHub: a pull request is `draft` while open as one, `open`, `merged`, or `closed` (closed without merging); an issue is `open` or `closed`. Closed pull requests are asked for as closed, which includes the merged ones, so `merged` shows under Closed.
- **It is GitHub's search** (`GET /search/issues?q=repo:<repo> is:pr|is:issue is:open|closed`), not the repository's issue listing. That listing mixes issues and pull requests, so a page of issues could be empty while GitHub has many more behind it; search is filtered by kind, gives `total_count`, and carries `draft` and the merge time of each item. Its limits are GitHub's: 30 searches a minute for an installation, and only the first thousand matches (`hasMore` stops there).
- **Issues need a permission that apps made before this did not ask for.** The manifest of 0074 now asks for Issues: read. For an app that has not been approved for it, GitHub's search does not fail, it answers no issues, which would read as "No open issues". So the issues request first asks GitHub for the installation's permissions and, without `issues`, answers 409 with `The Aven app has not been approved to read issues on <account> on GitHub. Approve its new permissions there to list them here.`, which the card shows. Pull requests need only the Pull requests permission the app always had, and list either way. Approving it is the account owner's, on GitHub (the app's installation page), as for the write permissions of 0044.
- **The card is Pull requests and issues in the side column**, above Commits: two tabs, an Open / Closed switch, a title that links to the item on GitHub with a status badge, who opened it, when it last changed and how many comments, and Newer and Older buttons with the page number. The tab, state and page are the card's own state, not the address; changing the tab or the state goes back to the first page, and another project starts at open pull requests.

## Consequences

- Each page is one GitHub search request (and, for issues, one more for the permissions), nothing is cached, and a page left open does not refresh by itself.
- A pull request's checks and reviews are not shown: they are a request for each pull request, which a page of ten should not make. The badge is its state only.
- An existing install's issues tab says the permission is missing until its GitHub App is approved for Issues: read; a new app made from Settings > Platform has it from the start.
- Labels, assignees and milestones are not shown or filterable.
