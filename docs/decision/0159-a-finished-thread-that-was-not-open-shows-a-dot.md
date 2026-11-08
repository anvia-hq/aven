# 0159: A thread that finished while it was not open shows a dot

Status: accepted. Adds to the finished-thread chime (decision 0096's sidebar polling).

## Context

The chime tells a person a thread finished only when the tab is not focused. A person who is looking at another thread, or another page with the sidebar, had nothing in the list to say which thread to go back to.

## Decision

- The sidebar marks a thread with a dot at its row's start when it stopped running while it was not the open thread.
- The marked ids are kept in localStorage (`aven.threads.unread`) so a reload keeps them, and opening the thread clears its dot. A thread that is gone is dropped.
- Only the sidebar's own transition from running to not running counts (`finishedThreads`), so a thread that finished while no page was open is not marked.

## Consequences

- The dot is per browser, not per account.
- It shows only on pages that draw the thread list; Settings has its own sidebar and does not track it.
