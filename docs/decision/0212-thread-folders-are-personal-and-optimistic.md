# Thread folders are personal, kept on the server and drawn before the server answers

Status: accepted.

## Context

The sidebar lists every open thread in one flat list. People with many threads want to group them. The grouping is a person's own habit, so it should not show to teammates, and it should follow them across browsers.

## Decision

- Folders are kept on the server per person: `thread_folders` (name, `open`) and `thread_folder_threads` (`user_id`, `thread_id`, `folder_id`, one row per person and thread, so a thread is in at most one folder of a person). Deleting a folder, a thread or a user cascades. Deleting a folder only unfiles its threads. An archived thread keeps its row and is not drawn.
- `modules/folders` in the control plane: `GET /folders` (folders newest first, each with `threadIds`), `POST /folders`, `PATCH /folders/:id` (`name`, `open`), `DELETE /folders/:id` and `PUT /folders/threads/:threadId` with `folderId` or `null`. Every call is scoped to the session user, a name is trimmed and 1 to 60 characters, and a thread can be filed only if the person can read it.
- Whether a folder is open is saved with the folder on the server, not in localStorage, so it follows the person.
- A fork follows its parent: a thread's folder is the one of its top-level ancestor in the list, and moving a fork moves that ancestor with its forks. A fork whose parent is archived is a thread of its own.
- Every folder action is optimistic with TanStack Query (`@tanstack/react-query`, added because the request needs `onMutate` rollback): `onMutate` cancels the folder query, snapshots it and patches it, `onError` restores the snapshot and shows a toast, `onSettled` refetches once the last pending folder write has ended. A new folder is drawn at once under a temporary client id and is swapped for the server's on the refetch. It cannot be dragged into or renamed until then.
- A new folder starts as a name field that is only a draft in the sidebar; Enter creates it, Escape or an empty name drops it, so a cancelled folder never reaches the server. "Move to folder > New folder…" creates the folder and files the thread in one mutation.
- Drag and drop is native HTML. A thread row carries the split view's payload (`THREAD_DRAG`) so there is one way to drag a thread. A folder, or the Unfiled area, accepts the drop and stops it there, and the split zone only listens inside the thread page, so a drop on a folder never splits.
- Every thread row has a menu with a Move to folder submenu (folders, New folder…, Remove from folder) for the keyboard and for touch.

## Consequences

- Not in scope: reordering, nested folders, shared folders. Shared threads stay in their own section.
- Folders are fetched once with a query keyed by the user id and are not polled.
- The first use of TanStack Query in the platform: `QueryClientProvider` is in `main.tsx`.
