# The theme rail fades where more cards follow

Status: accepted. Decided 2026-11-24. Refines the card rail of [0398](0398-a-theme-is-picked-from-a-card-that-shows-it.md).

## Context

The rail holds 26 cards of 172px in an 864px column, so about five are visible and the rest
are reached by scrolling. The card at either edge was cut flat: on the right the next palette
lost its swatches and half its name, with nothing at the edge to say the list continued. The
only other cue was the prev/next pair, which is disabled at the ends.

The cockpit board had already solved the same edge (`ScrollFade` in `task-board.tsx`): a
48px span painted `from-background to-transparent`, shown only on the side that has more to
scroll. The rail asked for the same, at a width that leaves more of the neighbour readable.

## Decision

- The rail sits in a `relative` wrapper with two 28px spans over it, one at each end,
  `pointer-events-none`, `aria-hidden`, painted
  `bg-gradient-to-r from-background to-transparent` (the right one mirrored).
- Each span's opacity follows the edges `useRailScroll` already measures: the left one is
  hidden at the start of the rail, the right one is hidden at the end. Both are visible in
  between, and both are hidden when the whole list fits.
- The change is 150ms, so the fade appears as the rail leaves an edge instead of popping.
- No new colour: the fade is the page's own `--background`, so it follows the chosen palette.
- 28px rather than the board's 48px: a card is 172px wide, and 48px would dissolve a quarter
  of the neighbour the rail is trying to show.

## Consequences

- The fade paints the page colour, so it only holds while the rail sits on `--background`,
  which it does in Settings. A rail placed on a card or inside a dialog would need the
  `mask-image` form instead.
- The span covers the rail's last 28px of height, the thin scrollbar's ends included.
- The selected card is never dimmed at rest: `revealCard` leaves it 4px from the left edge,
  and the left span is off at the start of the rail.
- When the list fits, both spans stay at `opacity-0`; nothing else depends on them.
