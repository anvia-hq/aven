# A profile's charts take the theme's accent, not its ink

Status: accepted.

## Context

Settings > Profile draws a year of days coloured by what each day spent, and every day's tokens as
an area chart. Both were drawn in `--primary` (decision 0176). In the palettes named after a colour
scheme — Catppuccin, Tokyo Night, GitHub, One Dark, Solarized — the primary is that scheme's accent,
so the charts came out blue. Mint is the default palette and the only one whose `--primary` is its
ink: near-white on the dark mode, near-black on the light one. There the chart read as a white line
on charcoal and the heatmap as a grey grid, which says "empty" whatever the numbers are.

## Decision

- A `--chart` token names the colour a chart is drawn in, and `--color-chart` maps it into Tailwind.
- Mint takes its own green (`--chart: var(--effort)`, the vivid mint the working dots and the effort
  marker already use); every other palette takes its primary (`:root[data-theme] { --chart:
  var(--primary) }`), which is the colour that palette is known by.
- The token is set on `:root` in two rules rather than in each of the fourteen palette blocks: Mint
  is the palette that writes no `data-theme` (decision 0155), so one selector covers the rest.
- `--brand` is not it: the Aven mark keeps Mint's neutral in every theme (decision 0156).

## Consequences

- The heatmap and the chart are the theme's colour in every palette, and the "Less … More" legend
  follows the same four steps of it.
- A new palette has to do nothing: it inherits its own primary. A palette whose primary is not the
  colour it is known by would need a `--chart` of its own.
- Anything else that draws a chart can ask for `--chart` and mean the same thing.
