# Each machine row is a card of its own

Status: accepted. Supersedes the "one card for all rows" part of 0091; the reporting, the numbers and the rest of the row stand.

## Context

0091 put the machines above Settings in one card: a bordered box holding every runner's row, each row a line inside it. Seeing the sidebar, the person wanted the card on each row instead, so the machines do not read as one block and each is a thing of its own.

## Decision

- **Every runner's row is its own card.** The list is a plain stack of cards with a small gap between them; the border, the card background and the rounded corner move from the list to the row itself (`machine-monitor.tsx`, `machine-row.tsx`). The row's height stays one line of the menu, so a card is as compact as the row was.
- **The rule under the machines stays.** The stack is still divided from Settings by a rule across the sidebar's width, as 0091 has it.
- **Nothing else changes.** The meters, the colours, the tooltip, the click to Settings > Runtimes, the order, the staleness rule and the rows giving way to a collapsed sidebar are as 0091 describes.

## Consequences

- More borders are drawn in the sidebar footer, and the stack is a few pixels taller for the gaps between cards.
- The native client contract is untouched: this is how the platform draws the list only.
