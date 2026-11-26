# An @ mention can point at a folder

Status: accepted. Refines 0036.

## Context

The composer's `@` offered only files, with a plain document icon for each, while the file explorer shows a material icon per file type. A person who wants the agent to look at a whole folder had to name each file.

## Decision

- The runner's `files.search` answers `{ paths, folders? }`. `folders` is the repository's folders that hold tracked or unignored files, ranked like files (name first, then path), at most `FOLDER_SEARCH_LIMIT` (10). It is optional on the wire, so an older runner that sends only `paths` still works and `WIRE_VERSION` does not change.
- The control plane passes `folders` on (`[]` for an older runner), and `GET /threads/:id/files/search` returns `{ available, paths, folders }`.
- A folder mention is a `file` mention whose name ends with `/` (`@docs/`). The message schema accepts a single trailing slash and nothing else odd (no `..`, no empty parts). The note the agent reads (`mentionNote`) lists a mentioned folder under "this folder of the workspace", apart from files.
- The `@` menu lists folders before files, with a folder icon, and files with the explorer's material icon (`FileIcon`). A folder chip in the composer and in a sent message shows a folder icon and the title "Folder name/".

## Consequences

An empty query lists the top folders first. Folder mentions are not expanded into their contents: the agent is told the path and reads it with its own tools. The chip's file icon is still the plain tabler one; only the menu uses the material icons.
