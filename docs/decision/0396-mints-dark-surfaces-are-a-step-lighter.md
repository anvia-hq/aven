# Mint's dark surfaces are a step lighter

Status: accepted. Refines 0292, which keeps Mint as a palette of its own and keeps Aven the default.

## Context

Mint's dark mode was the palette's original `:root[data-theme="mint"].dark`, and 0292 left it exactly as it was when Aven took the base tokens: a background at `oklch(0.17 0.014 195)`, or `#081111`. On a bright screen that reads as almost black, and the steps above it (card 0.20, popover 0.22, frame 0.225) are close enough together that a card barely lifts off the page. The lightness was the complaint; the teal hue was not.

## Decision

- Every surface token in Mint's dark block moves up by 0.03 in OKLCH lightness, keeping the hue and chroma and the steps between them: background 0.17 → 0.20, card 0.20 → 0.23, popover and muted 0.22 → 0.25, frame 0.225 → 0.255, sidebar-accent 0.23 → 0.26, secondary 0.24 → 0.27, accent 0.255 → 0.285. The background becomes `#0f1818`.
- `--muted-foreground` moves 0.62 → 0.66 and `--ring` 0.5 → 0.55, because the lighter surfaces took contrast away from both. At 0.62 the muted text sat at 4.39:1 on `--muted` and 3.93:1 on `--accent`; at 0.66 it is at or above 4.61:1 on every surface, and the focus ring stays visible on the new background.
- Foreground, primary, `--code`, `--effort`, the graph colours and the destructive and success colours do not move: they were read against the page, not the page itself.
- Mint light and Aven, the default, are untouched.

## Consequences

- Mint dark is visibly lighter without turning into Aven: the hue stays 195, so it is still the teal palette 0292 set beside a cool gray default.
- Anything that measured Mint's dark background by hand, such as a screenshot or a document quoting `#081111`, now reads `#0f1818`.
- The iOS client keeps its own copy of Mint's tokens in `clients/ios/AvenMobile/Sources/Theme.swift` (0175), which was already an approximation of the palette before this change and is not moved with it.
