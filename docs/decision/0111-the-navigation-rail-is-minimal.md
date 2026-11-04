# The navigation rail is minimal

Status: accepted. Supersedes the rail's width and appearance in 0052; keeps the bot's character from 0062 and the cockpit entry from 0104.

## Context

The rail mixed a filled logo tile, an unframed bot and a thin dashboard icon. The person chose the minimal rail from three previews, rather than matching filled tiles or a labeled dock, with the Aven logo kept.

## Decision

- Keep the original Aven mark, standing alone rather than in a filled tile, with a subtle divider before the bot and cockpit.
- Keep the person's main bot's avatar, at 24px. Draw the cockpit as Mynaui's outlined four-cell `Grid`, at 20px.
- Each link has a 44px target, the same rounded hover and focus states, a tooltip on hover or keyboard focus, and `aria-current="page"` with a short bar at the rail's edge when selected. The logo selects the threads and projects; the other entries select their whole section.
- The desktop rail is 56px (`w-14`), giving the targets 6px either side. Keep its sidebar offset (`left-14`) and the pointer measurement (`RAIL_WIDTH` in `use-sidebar-width.ts`) in step. Below `md`, the rail stays hidden and the existing mobile sidebar remains.

## Consequences

The logo and personal bot remain recognizable without competing tile styles. Shared `RailLink` owns the target, tooltip and selection treatment; the feature modules keep their destinations and avatar. Sidebar resizing and its saved width still work from the rail's new edge.
