# A project card opens the project

Status: accepted. Supersedes the choice of a project in 0172.

## Context

0172 made `/projects` two columns where a click on a project card chose it, narrowing the thread column to its threads, and an arrow on the card opened the project's own page. A person clicking a project expects to arrive at the project, with its files, README and threads, and read the click as a filter by surprise. The threads of one project are also on its page.

## Decision

- A project card is a link to the project's page. Its arrow, its selected state, the choice and `?project=` are gone, and so are the thread column's All projects and Open project buttons.
- The thread column always lists the threads of every project, newest first, with the project's name on each row; New thread starts one without a project chosen.
- The thread column's heading, its tabs and its rows share one left edge.
- The rest of 0172 stands: the two columns, the search, the views and the runner filter.

## Consequences

- To see one project's threads a person opens the project, whose page has its Recent threads.
- An old address with `?project=` is read as `/projects` and the value is dropped.
