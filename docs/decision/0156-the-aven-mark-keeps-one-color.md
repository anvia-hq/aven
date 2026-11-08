# 0156: The Aven mark keeps one color in every theme

Status: accepted. Builds on 0155 (color themes).

## Decision

- The Aven mark (`AvenMark`) is drawn in `text-brand`, a token that is Mint's neutral in light and dark mode (`--brand`, set in `:root` and `.dark` in `index.css`).
- The color themes never set `--brand`, so the mark does not change with the theme. Buttons, links and other `text-primary` uses still follow the theme.

## Consequences

- A new theme needs no change for the mark.
