# The portal shows a thread's files, read-only

Status: accepted. Builds on 0010 (per-thread workspaces), 0015 (the call path to the runner) and 0030 (the Changes panel, whose column it shares).

## Context

A person could see what the agent changed (0030) but not read the files it works on. The thread page should show the workspace as a tree of folders and files, with files opened in tabs, and remember what is open.

## Decision

- **The runner reads the workspace on the host (wire version 11).** `files.list {threadId, path}` and `files.read {threadId, path}` are calls like `diff.get`. A listing is `{ entries }` (folders first, at most 2000) and a file is text (cut at 512 KiB), binary (not sent) or missing; null is a thread with no clone yet. Nothing is written: the panel is for reading, and the agent is the one who edits.
- **A path is confined by what it resolves to, not what it spells.** The agent works in a container and can make a symlink there that points anywhere on the runner's machine. `workspace-files.ts` takes the real path and refuses anything outside the workspace's real path, and the repository's own `.git`. A refused or absent path reads as missing (a folder as empty), so a probe learns nothing about the host.
- **The control plane relays it.** `GET /threads/:id/files?path=` and `GET /threads/:id/files/content?path=`, scoped to the caller's organization like the desktop and the diff. A runtime's answer is checked, and its error text stays in the log.
- **The Files panel** (a button beside Changes and Desktop) shows the open file with line numbers, in tabs, and the tree beside it, which a button hides. A folder is read when it is first opened; while the agent works the open folders and the shown file are looked at again every five seconds, and once more when the run ends.
- **What is open is kept per thread in localStorage** (`aven.files.<thread id>`: opened folders, open tabs, the active tab, whether the tree shows), as the other layout state is (decision 0017). It is not shared across browsers.
- **Files, Changes and Desktop share one column** with one remembered width; open together they stack in it.
- **The filter looks through the folders that are open**, by path. Searching files that were never opened would need a search on the runner.
- **No syntax colours.** A highlighter would be a new dependency; the file is plain monospace. It can be added after asking.

## Consequences

- A person can read anything in a thread's workspace that is not ignored by the path checks, including `.env` files the agent made. They could already ask the agent to print them, so this is not new access, but it is easier.
- A symlink to a folder shows as a file and reads as missing.
- A file that changes while it is shown is replaced on the next look; there is no cursor or selection to lose.
- Opened files that were deleted stay as tabs and say so.
