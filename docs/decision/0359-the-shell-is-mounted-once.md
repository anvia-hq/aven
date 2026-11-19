# The shell is mounted once, and its sidebar follows the path

Status: accepted. Decides where the frame of a signed-in page lives, and where each section's sidebar comes from.

## Decision

Every signed-in page is drawn inside one shell, mounted by `routes/_authed.tsx`. The sidebar that shell shows is picked from the path (`modules/navigation/components/shell-sidebar.tsx`): settings, the bot and the inbox each bring their own, and everything else gets the threads' list.

## Context

The shell used to be the component of four different layout routes — `_shell` for threads and projects, and one each for settings, the bot and the inbox — so moving between sections destroyed the frame and built a new one. The rail, the person's card, the bots' three.js avatars (painted a frame after they mount, `bots/avatar-stage.ts`), the Mentions button, the announcement banner and the sidebar's own scroll position all started over: the avatars blinked and the rail's rotation through the bots that need the person restarted, on a click that only meant to open Settings.

The frame is the same on every page — same width, same header, same rail, same footer — so nothing in it should be rebuilt when the page inside it changes. What does change is the middle of the sidebar, and that is now the only part that does.

## Consequences

A new section of the app adds its sidebar to `shell-sidebar.tsx` beside its rail link in `app-shell.tsx`, and its routes nest under `_authed` with no layout file of their own. Threads and projects share one sidebar, as they did.
