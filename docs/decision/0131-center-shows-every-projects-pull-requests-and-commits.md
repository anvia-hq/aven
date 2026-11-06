# Center shows every project's pull requests and commits on one screen

Status: accepted. Builds on 0090 (the commit graph), 0092 (pull requests and issues of a project) and 0104 (the cockpit's own place in the rail).

## Context

A project's page shows its commits and pull requests, but looking after several repositories meant opening each page in turn. The person wanted something like GitKraken's overview: git in one place, not per project.

## Decision

- **A place of its own**, `/center`, in the rail under the cockpit's (and in the phone sidebar), with the shell's frame and a sidebar of "All projects" and each project.
- **All projects at once.** The page has the pull requests of every project, open or closed, the latest changed first, each with its project, beside the latest commits of every project, newest first. Choosing a project (`?project=<id>`) shows only its pull requests and its commits as the project page's graph with pages, since a graph needs one history.
- **Read-only, from GitHub.** Nothing new on the server: the page asks each project's own `/pulls` and `/commits` (a page of each) with the installation's read-only token and puts them together in the browser. A project GitHub cannot be asked about is named, and the rest still show. A commit or a pull request opens on GitHub; merging, closing and commenting are not done here.

## Consequences

The cost is two requests per project each time the page opens or Refresh is pressed, which suits a person's handful of repositories; a very large workspace would want a server-side feed. Acting on pull requests (merge, close, comment) and a diff view are the next steps and need a decision of their own, since they use the person's GitHub account and the app's write permissions.
