# The shell is a framed panel beside a rail

Status: accepted. The rail's width and appearance are superseded by [0111](0111-the-navigation-rail-is-minimal.md).

## Context

The authed layout was a sidebar and a page filling the window. We wanted a frame around the app and a place for the product's mark.

## Decision

- **A frame**: the window is the `frame` colour (`--frame`, a light gray, near-black in the dark theme). The sidebar and the page are **one white rounded panel** inside it, told apart by the sidebar's own border, not two cards with a gap. A first try with a floating sidebar card left a gap and was dropped.
- **A rail**: a 48px strip at the far left with the Aven mark, linking to `/threads`. It is hidden below `md`. It holds nothing else yet.
- The sidebar is `fixed`, so it is placed by hand beside the rail (`left-12`, `inset-y-2`, its height less the frame's margins) and its inner panel is rounded on the left. It is not clipped with `overflow-hidden`: its resize handle sits half outside its edge.
- Dragging the sidebar's edge measures from the rail: width is the pointer's x minus 48 (`use-sidebar-width.ts`).
- Pages that fill the window are 1rem shorter (`calc(100svh-1rem)`) so they fit the frame without a scrollbar.

## Consequences

- The rail's 48px is written in three places (`w-12`, `left-12`, `RAIL_WIDTH`); change them together.
- Settings has its own layout and is not framed.
