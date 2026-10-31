# A thread's side panels are cards on the frame

Status: accepted. Refines 0052 (the shell is a framed panel beside a rail) for a thread's page.

## Context

Files, Changes, Desktop and Terminal open in one column beside the conversation, stacked and divided by lines inside the shell's one white panel. Two tries at making each a card inside that panel (an inset on the frame's colour, then a flush first card) left the cards' headers off the conversation's header line, or a gray band inside the white panel.

## Decision

- **On a thread's page the white panel is drawn in two parts that look like one.** The sidebar's container gets the top, bottom and left border and rounded left corners; the conversation (`routes/_authed/threads/$threadId.tsx`) is its own card with the top, bottom and right border and rounded right corners, on `bg-background`. The layout (`routes/_authed.tsx`) drops the wrapper's background, ring and clip for `/threads/:id` only; every other page keeps the single panel.
- **Each side panel is a card of its own on the frame**, `rounded-xl` with the same border and `bg-background` (`components/side-panel.tsx`), in the same vertical extent as the conversation, so a panel's header is level with the conversation's header and the cards' last edge is level with its bottom.
- **The dividers are gaps of the frame's colour**, 8px wide and still draggable: the one between the conversation and the column, and the ones between cards.

## Consequences

- With no side panel open, a thread looks as it did.
- A change to the shell's outline (radius, border colour) must be made in the layout's single panel and in the thread's two parts.
