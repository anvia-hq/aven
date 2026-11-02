# The project page reads the repository from GitHub

Status: accepted. Builds on 0013 (projects are GitHub repositories, read with an installation's token) and 0031 (the Files panel of a thread).

## Context

A project's page showed a composer, its threads and its variables, and nothing of the repository itself. The person asked for it to look like a repository page: the files, and the README. A thread's Files panel (0031) reads the thread's workspace through its runner, which has a clone only after a first thread, and may be offline; a project page has to work from the first visit.

## Decision

- **The files and the README come from GitHub, not from a runner.** `GET /projects/:id/files?path=` lists a folder of the repository's default branch, folders first and then files by name (`{ entries: [{ name, path, type: "file" | "directory" }] }`), and `GET /projects/:id/readme` gives the README as text (`{ readme: { name, path, text, truncated } | null }`, cut to 200,000 characters). Both use the installation's read-only token (`GithubClient.folder` and `.readme`, contents read permission as for cloning) and so need no runner, no clone and no thread. A project of another organization is not found.
- **A path is one well-formed path.** It goes into a GitHub API path one encoded segment at a time, and an empty or dot-only segment, which would climb out of `/repos/<owner>/<name>/contents/`, is refused with the rest of the query's checks (`folderQuery`). A path that is a file, a repository the installation no longer sees and an empty repository are a 404 for the folder; a repository without a README has `readme: null`.
- **Only the default branch, and only the top has a README.** Other branches and a folder's own README are not read; a file is not opened in the app, the page links to it on GitHub. A relative link in the README is made absolute against the repository on GitHub.
- **The page is two columns** (one below `lg`): the repository on the left (the title, the files, the README, and the composer over them), and what is about the project on the right (About, recent threads, environment variables).

## Consequences

- Every visit to a folder is one GitHub API request, as is the README; installation tokens are cached for about an hour, but nothing is cached for the contents. A project page left open does not refresh by itself.
- Relative images in a README of a private repository do not load: the browser has no token, and the control plane does not proxy them.
- The repository is read as GitHub has it, not as a thread's workspace has it: a thread's changes are not shown until they are pushed.
