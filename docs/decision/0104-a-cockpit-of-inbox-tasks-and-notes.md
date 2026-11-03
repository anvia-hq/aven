# A cockpit of inbox, tasks and notes

Status: accepted.

## Context

A person working with Aven's threads and bots also keeps track of things of their own: what came to mind and is not dealt with yet, the work in front of them, notes to keep. They wanted a place for it in the app, under the bot in the rail, with an inbox, tasks shown as an issue tracker such as Linear shows them, and notes, each with tags. Plain records, kept and changed by the person.

## Decision

- **The cockpit is the person's, in every workspace**, as their bots and skills are: `cockpit_inbox_items`, `cockpit_tasks` and `cockpit_notes` hold a `user_id`, and every route finds a record within the signed-in person's own (`modules/cockpit`, `/cockpit/inbox`, `/cockpit/tasks`, `/cockpit/notes` with `GET`, `POST`, `PATCH /:id` and `DELETE /:id`, and `GET /cockpit/tags`). Another person's record is not found.
- **Tags on everything, no categories.** A record carries up to ten tags, a `text[]` column: lowercase letters, digits, `-`, `_` and `/` (`area/sub` stands in for a category), made so from what is typed (`#Front End` is `front-end`, `normalizeTag` in `@aven/protocol/cockpit`). `GET /cockpit/tags` counts each tag on each kind; the sidebar lists them, and a tag filters the page on screen (`?tag=`).
- **The inbox captures, and marks done.** An item is a title, details and tags; it is open or done, and done ones are kept apart rather than deleted.
- **Tasks are an issue tracker's.** A task has a number of its own among the person's tasks (`T-12`, taken under a per-person lock), a title, a description, a status (`backlog`, `todo`, `in_progress`, `in_review`, `done`, `cancelled`), a priority (`urgent`, `high`, `medium`, `low`, `none`), a due day and a `position` in its status's column. The tasks page shows them as a board, a column a status, where a card is dragged to another column or place with the browser's own drag and drop (no library) and saved at once with its new status and a position between its neighbours'; or as a table (`?view=list`) whose status and priority change in the row. A new task goes to the top of its column.
- **Notes are markdown**, with a title, tags and a pin that keeps them first; the editor has Write and Preview.
- **No agent acts on the cockpit.** It is not offered to bots or threads: that would be a decision of its own, with the person's word rules of 0088 and 0102.
- **The rail has its entry under the bot's**, and `/cockpit` has the app's shell with a sidebar of its three pages (with the open inbox items and the unfinished tasks counted) and the tags.
- **Limits:** 2,000 records of each kind a person, a title of 200 characters, a body of 50,000.

## Consequences

- The person has their own list of things beside the app's threads and bots, on every machine they sign in from.
- Each change is saved as it is made, and the page shows it before the server answers; a change that fails is put back from the server.
- Giving bots the cockpit (a bot that files a task from a chat, or works the inbox) is a later decision.
