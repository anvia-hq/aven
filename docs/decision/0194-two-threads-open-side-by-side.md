# Two threads open side by side

Status: accepted.

## Context

A person who works with several agents moves between threads to read one while another runs. Amp lets a thread be dragged beside the open one.

## Decision

- A thread page can hold two threads, never more. The second is `?split=<thread id>` on `/threads/<id>`, so a reload, the back button and a link keep it.
- Dragging a thread row in the sidebar onto the page shows a drop zone on the half it is over and opens it on that side. With two open, a drop replaces the pane on that side, and a thread already open on the other side swaps the panes. Dropping the open thread on itself does nothing.
- Each pane is a whole thread (`ThreadPane`): its header, messages, composer and live stream. In a split a pane has no overview column and no diff, files, terminal or desktop panels, and its header has a close button in place of their toggles. Closing a pane leaves the other one as the thread page.
- A split exists only from 1024px of width. Under it `?split` is ignored and the page shows the first thread.
- A pair is kept in the browser (`localStorage`, `aven.split-pairs`, forgotten on sign-out) when a split opens. The sidebar draws the two threads as one bordered row of two halves side by side, each with its status tile and a truncated title (no time, archive or rename), at the place of the first one, and a click on either half opens both again. A stack of two full rows was tried and read as clutter. An × on the group, or closing a pane, dissolves it. A thread is in one pair at most. A pair whose thread is archived or gone is not drawn, and its rows show alone.
- Opening a thread that is not in a pair, from the sidebar by a click, leaves the split, since it is a new page. There is no row menu or keyboard way to open a thread to the side yet.

## Consequences

- Pairs are per browser, not per account: another device does not see them.
- Two threads hold two live streams, and both are marked read.
- The panels of a thread (diff, files, terminal, desktop) are reached by closing the split.
