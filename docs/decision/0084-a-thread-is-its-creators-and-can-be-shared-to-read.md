# A thread is its creator's, and can be shared to read

Status: accepted. Narrows 0008 (a runner and what happens on it are shared by the organization), 0015 (the Desktop), 0031 (the Files panel), 0039 (waking the sandbox), 0044 (the run's GitHub account), 0053 (the terminal) and 0071 (background processes), which let every member of the organization do these on every thread of it.

## Context

A thread had no owner check. Every member of the organization saw every thread, could message it, drive its Desktop, read its files and stop its processes. A thread's sandbox holds the GitHub sign-in and personal variables of the person its latest run was sent as (0044, 0045), so a member who sent a message to someone else's thread took the sandbox over, and a member who took over its Desktop could reach the last sender's `gh` token, which the terminal's own check (0053) had been added to prevent. The person asked for threads to belong to their user, to be seen only by them, and to be shareable with the workspace to read, never to change.

## Decision

- **A thread is private to its creator** (`threads.created_by`). `threads.visibility` is `private` (the default; every thread that existed becomes private to its creator) or `workspace`. Nobody else of the organization sees a private thread, whatever their role: an owner or an admin of the workspace has no more access than a member. Another person's thread is not found (404), as another organization's always was.
- **Sharing is the creator's alone and is to read**: `PATCH /threads/:id` with `visibility` (only the creator may change a thread at all). `workspace` means every member of the organization, no link and no one person; the creator takes it back at any time.
- **A route says what it does with a thread's `:id`**, like `auth` and `org`: `thread: "read"` (`modules/threads/access.ts`) lets the creator and, once it is shared, every member through; `thread: "own"` lets the creator only. Read: the thread and its conversation, its events stream, Files (including search), Changes and the images the agent showed. Own: messages, answers, cancel, rename, archive, share, Ship (and whether it is ready), the Desktop (status, wake, takeover, release, the stream), the terminal and background processes (list, stop, logs). The service keeps a second check where it acts (`threadsService.owned` for a message or an answer, and for the terminal), so a route that forgot the option would not be enough.
- **Nobody but the creator sends a run**, so a sandbox only ever holds its creator's sign-in and variables. `threads.last_run_by` stays (it is how a thread started before this, and run by someone else, keeps its shell closed until its creator runs it again).
- **The lists**: `GET /threads` gives the person's own threads and the ones the workspace shared, each with `createdByName`. The platform shows own threads as before, shared ones under "Shared with workspace" in the sidebar and on the new-thread page with who shared them, and both on a project's page. In the sidebar a shared thread, the creator's own or another's, has a Share mark beside its project's tile. A thread opened by someone else is read-only: a note where the composer was, no Ship, no sharing menu, and no Desktop, Terminal or Background tasks.

## Consequences

- A person cannot reply to, continue or take over a teammate's thread; to build on it they start their own. There is no "fork" yet.
- The conversation of a shared thread is readable by every member, as is the workspace's files and diff through the runner: what the agent printed or wrote is visible, so a person sharing should know that. Processes and their logs, and the Desktop, which may show anything, are never shared.
- A shared thread's `running` state is on the list a teammate gets, and its live events stream works for them, but the page does not push a new share to other people's lists: they see it when they next load threads.
- The runner, the project and the workspace's variables are still the organization's (0008, 0045).
