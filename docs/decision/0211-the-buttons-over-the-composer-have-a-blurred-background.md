# The buttons over the composer have a blurred background

Status: accepted. Partly superseded by 0219: nothing is built for macOS VMs; the idea is dropped.

## Context

The ship bar sits over the end of the conversation, which scrolls under it. In dark themes the outline buttons were about 4% opaque, so text showed through the Update PR button, its menu and the changes badge.

## Decision

- The ship bar's buttons (Ship menu, pull request chip, changes badge) share `FLOATING_BUTTON`: the theme's background mixed 6% toward its foreground at 85% opacity, a 12px backdrop blur and a shadow.
- It is built from theme variables, so it works in every theme. The solid primary buttons keep a plain shadow.

## Consequences

- Text scrolling under the bar is hidden in the buttons' area, in light and dark themes.
- A new button placed over the conversation should use the same class.
