# 0293. Threads are grouped by recency and archived after 30 days

Status: accepted. Supersedes 0212 (thread folders is removed) and the pulsing and folder parts of the sidebar before it.

The sidebar listed threads under a "Threads" label, with the person's own folders on top and the rest below. Folders were a manual way to keep the list short, and the list still grew without end.

- The "Threads" label and the folders are gone. The sidebar shows three groups that are always drawn, even when empty: Today, Last 7 days and Last 30 days. Each is a collapsible that opens and closes with the same height and opacity transition as a tool group, and each remembers its state in localStorage (`aven.sidebar-group.today`, `.week`, `.month`; per browser, not synced).
- A thread belongs to a group by its `updated_at`: Today is since local midnight, Last 7 days the previous seven days, Last 30 days the rest. A fork stays with its parent, in the group of whichever of the two was touched last. Threads shared by others keep their own "Shared with workspace" section.
- A thread with no activity for 30 days is archived by the control plane, not hidden by the client. `createThreadRetention` sweeps every hour for `open` threads, not waiting for an answer, whose `updated_at` is older than `THREAD_ARCHIVE_AFTER_DAYS`; it skips a thread that is running, leaves snoozed ones alone, and archives each as its creator would, which also stops any run and frees its sandbox on the runner. A thread that fails to archive is skipped and tried again at the next sweep. Until the next sweep, a thread older than 30 days stays in the last group.
- Folders are removed with their data. Migration 0069 drops `thread_folders` and `thread_folder_threads`, so every person's folders are gone for good. The `/folders` routes, the `modules/folders` code in both apps, `FOLDER_NAME_MAX` and the folder e2e spec are removed. The thread row's menu keeps only Archive.
- A thread that is archived is no longer listed. There is no screen for archived threads yet.
