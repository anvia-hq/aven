# A profile heatmap shrinks with its section

Status: accepted.

## Context

Settings > Profile draws Activity as 53 weeks of 12px cells with 4px gaps inside a `max-w-4xl` page. The page width, its padding, the gaps and the labels are `rem`, so the interface text size changes them, but the cells were fixed pixels. At Small the section is 778px wide and the grid is still 858px, so its `overflow-x-auto` shows a horizontal scrollbar; at Default it only just fits, 858px in 864px.

## Decision

- The week and day tracks are `minmax(0, 0.75rem)`: 12px at Default, smaller when the section is narrower, and a little larger when the interface text grows.
- Both grids are `min-w-0 flex-1`, so they take the section's width and the tracks shrink instead of overflowing it.
- Cells are `aspect-square` in seven auto rows, so a row follows its track's width and the weekday labels still line up.
- The month labels grid clips its own overflow, so a label wider than its column cannot widen the scroll area.

## Consequences

- At Small the cells are 10.8px; at Default, Large and Extra large the grid fills the section, 12.9px at most.
- A narrow window still scrolls the heatmap horizontally, as before. Changing the text size no longer does.
- A month label that starts in the last week is clipped at the section's right edge instead of scrolling. No month in the 53-week window starts there today.
