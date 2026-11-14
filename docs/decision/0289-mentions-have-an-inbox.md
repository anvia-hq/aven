# 0289. Mentions have an inbox

Status: accepted. Extends 0205.

A mention of a person in a multiplayer thread only put a dot on the thread and played a note, and the row was deleted once the thread was opened. Someone who missed the dot had no record of who had called them, or what was said.

- `thread_mentions` keeps its row after the thread is opened: it now carries the author, a 160-character excerpt (the mention shown as `@Name`) and `read_at`. A mention written again for the same thread and person replaces the author and excerpt, and is unread again.
- `GET /threads/mentions` lists the person's mentions (newest first, 30, only threads they can see in the workspace), each with the thread title, the author, the excerpt, the time and whether it is read. `POST /threads/mentions/read` marks the workspace's mentions read. `GET /threads/mentioned` and `POST /threads/:id/mentions/seen` keep their meaning: waiting is now "not read", and seen sets `read_at`.
- The sidebar header has an `@` button with a dot while any is unread. It opens a popover: `Mentions`, the unread count, a menu with "Mark all as read", and one row per mention that opens the thread, which marks it read. With none, it says so. The list refreshes every 15 seconds while the tab is shown, on focus, and when a thread's mention is seen.
- The dot on the thread row and the soft note of 0205 are unchanged.

A migration adds the three columns. Rows from before it stay unread, as they were waiting. Only people in a thread are told; mentions in a bot's chat are not in the inbox.
