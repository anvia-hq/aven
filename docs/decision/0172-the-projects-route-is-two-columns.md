# The projects route is two columns, with the threads beside the projects

Status: accepted.

## Context

`/projects` was a grid of project cards, and the only thread list was the sidebar or the recent threads on a project's own page. To answer "what is running in my projects, and what did I work on where" the person had to open each project in turn, and the projects page carried no way to narrow the list beyond reading it.

The grid was also several columns wide, so each card was small while the space beside the cards was unused. Threads of a project were two clicks away, in a page that is mostly the repository (files, README, commits, pull requests).

## Decision

- `/projects` is two columns: the projects on the left, the threads of the chosen project on the right (`components/projects-page.tsx`).
- The left column keeps the project cards the person knows (tile, name and repository, branch, runner, when it changed), one to a row, with a visible selected state, a search over the name and repository, the views All, Mine and Working, and a runner filter when the workspace has more than one runner (`components/project-filters.tsx`, `project-list.tsx`, `project-card.tsx`, `filters.ts`).
- Choosing the project that is already chosen clears the choice, so the right column returns to every project's threads. A card's arrow opens the project's own page, and so does Open project in the thread column's header.
- The right column lists Open and Archived threads apart, newest first, as compact rows: one line each, a small tile, the project's name when every project is shown (`components/project-threads.tsx`, `modules/threads/components/thread-list.tsx`'s `compact` and `showProject`).
- The route's search carries the choice and the filters (`?project=`, `?q=`, `?view=`, `?runner=`), so a reload or a back button keeps them (`parseProjectsSearch`). A project that no longer exists drops out of the address.
- Neither column is framed in a card: the filters, the cards and the thread rows sit on the page's background, as the cards did before.

## Consequences

- A project's threads are one click from the projects page, and the list of threads is readable without opening a project. The project page keeps its own Recent threads card, which is where a repository's details live.
- Filtering is done in the browser over the projects the person can already see, with no request; the panel filters nothing on the server.
- The filters apply to the projects, not to the threads: a project hidden by a filter stays chosen and keeps its threads on the right, which is what the address says.
- The thread column shows no creator name on its compact rows, since a workspace-shared thread's creator is the row's only other information and the row is meant to stay one line.
- The project page and the new-thread screen keep the roomy thread rows; only this page asks for the compact ones.
