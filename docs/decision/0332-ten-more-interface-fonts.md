# Ten more interface fonts

Status: accepted. Builds on 0157.

## Context

The "Interface font" dropdown offered the system font and four web fonts.

## Decision

- `SANS_FONTS` gains DM Sans, Manrope, Plus Jakarta Sans, Nunito Sans, Lato, Open Sans, Roboto, Poppins, Work Sans and Outfit, each with its Google Fonts query, loaded when chosen as in 0157. Lato is requested at 400 and 700, the only weights it has.

## Consequences

- Nothing else changes: the choice is kept on the device, and a stored id that is no longer listed falls back to the system font.
