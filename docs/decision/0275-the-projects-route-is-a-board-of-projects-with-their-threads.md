# The projects route is a board of projects, each with its threads

Status: accepted. Supersedes the two columns of 0172 and the thread column of 0196.

## Context

0172 and 0196 left `/projects` as two columns: project cards on the left, and one list of every project's threads on the right. The two halves said the same thing twice without joining it. A thread row named its project in small type at the far end, a project card gave only a count of its threads, and to learn what was going on in one project a person read the right column for its name or opened the project. Each half was also half as wide as the page, so the cards were long rows with little in them.

Three layouts were built and compared on the same seeded workspace: a grid of cards beside a narrower thread column, one table with a row per project, and a board where each project's card lists its own threads. The board was chosen. The table is the better fit for dozens of projects and can be offered as a second view later.

## Decision

- `/projects` is one board (`components/projects-board.tsx`): two columns of cards from 1024px, three from 1536px, one below. A card is as tall as its threads, so the columns are filled like a masonry.
- A card's head is a link to the project's page (0196 stands): its tile, name, repository or folder, branch and runner. The runner is a dot and its name (`components/runner-status.tsx`), green when it is online. A `+` beside the head starts a thread in that project.
- Under the head are the project's threads, newest first, four at most, each a link to the thread. A running thread carries the project's moving tile and the word `working`; the others a dot and how long ago they changed. `n more` opens the project.
- Projects with a running thread come first, then the ones that changed last, counting a thread's change as its project's (`activity.ts`).
- The search, the views and the runner filter are one row above the board (`components/project-filters.tsx`). At its right end Open and Archived choose which threads the cards list. Archived shows only the projects that have archived threads, with up to fifty each, since no other page lists them.
- New thread, without a project chosen, is in the page's header beside Add project.
- `project-list.tsx`, `project-card.tsx` and `project-threads.tsx` are gone, and so are the `compact` and `showProject` rows of `thread-list.tsx`, which only this page used.

## Consequences

- What is running where is read in one look, and a thread is one click from the page with its project above it.
- The page no longer has one list of every thread by time across projects. The sidebar has that list for the person's own threads.
- A project with many threads shows four of them; the rest are a click away on its page.
- The filters still apply to projects and are done in the browser. Open or Archived is not in the address, so a reload returns to Open, as before.
