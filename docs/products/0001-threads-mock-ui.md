# Threads (mock UI)

Status: superseded by 0003 (threads are now real: see `0003-threads-and-agent.md`)

An Amp-style coding agent UI in `apps/platform`. Everything is client-side mock data; nothing is persisted and no real agent runs.

## Screens

- `/threads`: new thread page. A header with Import repository on the right, the prompt box with the project picked inside it (beside the attach button and the model), and recent threads. There are no prompt suggestions.
- `/threads/$threadId`: thread view. Header (title, repo/branch, mode, context used), message list, prompt input pinned to the bottom.
- Shell: a slim rail on the far left with the logo, and the sidebar and page as one white panel in a frame (decision 0052). Sidebar: Threads and Projects links, a "Threads" list (newest first, spinner while the agent is running), and the **New +** button that opens `/threads`.
- Signing in or registering lands on `/threads`.

## Thread view

A message has ordered `parts`: text, or a tool call. Tool calls render as collapsible rows:

| Tool     | Shows                  | Expands to |
| -------- | ---------------------- | ---------- |
| `read`   | file path              | nothing    |
| `search` | query and result count | output     |
| `edit`   | file path, `+n -m`     | diff       |
| `bash`   | command                | output     |

## Mock agent

`useAgent().send` (in `modules/threads/hooks/use-agent.ts`) appends the user message, then replays a scripted reply (text, search, read, edit with a diff, typecheck, summary) with short delays, flipping each tool from running to done. `create` makes a thread from the first prompt. State lives in `threadsAtom` (`modules/threads/atoms/threads-atom.ts`), seeded with three example threads. A reload resets it.

## Next (not built)

Persist threads in `@aven/db`, stream a real agent from control-plane, markdown rendering, file mentions, stop/retry.
