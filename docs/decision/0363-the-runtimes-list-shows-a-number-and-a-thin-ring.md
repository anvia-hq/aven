# 0363. The runtimes list shows one number and a thin ring per metric

Status: accepted. Supersedes 0290 (a card of four load tiles, each with a sparkline and the move since the previous report).

## Context

The card of 0290 read well and was heavy: each of CPU, MEM and DSK carried the percent, a meter, the capacity behind it, a sparkline and the arrow of the move since the previous report. The history lived in a `useRef` in `use-runtime-trend.ts`, kept and pruned on every poll for every runtime, and nine sparklines were drawn again on each report. The person asked for the same card without the history, so it would not weigh the app down, and picked the shape from designs drawn for it: five card layouts, then five that drew the percent as a ring, then three thin-ring ones. The chosen one puts the number first and the ring at the right of each column, centered against the number.

## Decision

- The header is one row: the machine mark, the name with its version, when it was seen and its sandbox count, then the badges, the Online pill and the actions. Under `md` the badges and the actions take a line of their own, and the meta line is cut with an ellipsis rather than pushing the row.
- Load is three equal columns with a hairline between them: the label (`CPU`, `MEM`, `DSK`), the percent at `text-xl` with a muted `%` and what is behind the number (cores, used of total) on the left, and a 28px ring at the right of the column, centered against that block rather than sitting on its baseline, filling clockwise from the top (`components/metric-ring.tsx`).
- The ring is coloured by `meterLevel`, as the upright meters of the sidebar are: blue below 60%, `meter` from 60%, destructive from 90%. It draws no arc when the percent is unknown.
- There is no history. `hooks/use-runtime-trend.ts`, `components/runtime-sparkline.tsx` and their tests are gone, so nothing in the runtimes page holds state between polls: the card is drawn from the report the list already fetched, and `isStale` still decides whether it has one.
- Each column is one `role="meter"` with its label, minimum, maximum and value, as in `machine-load.tsx`, so three loads are read as meters and not as a picture beside a number.
- Below `md` the columns stack with a rule between them and the header takes a second line for the badges, so no number is cut at the settings page's width on a phone.

## Consequences

- The card is shorter than the four tiles it replaces, and a poll now redraws three SVG rings instead of nine sparklines.
- History can come back as a component of its own, added to a column, without changing the card's shape.
- Proof: `.aven/proof/runtimes-rings/after.png` (the card at the settings page's width) and `narrow.png` (the same at 420px).
