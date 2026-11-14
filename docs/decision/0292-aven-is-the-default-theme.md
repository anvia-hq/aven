# 0292. Aven is the default theme

Status: accepted. Builds on 0155.

Mint was the default palette: the base `:root` and `.dark` tokens, with no `data-theme` on `<html>`. The dark Mint was very dark and teal; the wanted default is lighter and gray.

- A new palette, `aven`, is the default. It takes the base `:root` and `.dark` blocks. Its light mode is Mint's. Its dark mode lifts the surfaces a little above Mint's (the background from 0.17 to 0.18, the card to 0.21, the frame to 0.225) and moves them from teal (hue 195) to a cool gray (hue 240, chroma 0.006 against Mint's 0.014), keeping the steps between background, card, popover, muted, accent and frame.
- Mint stays, unchanged, as a palette of its own: `:root[data-theme="mint"]` and `:root[data-theme="mint"].dark` hold its old values, and the picker lists it after Aven.
- A person who had picked Mint keeps it (their stored palette is `mint`, now an explicit theme); one who never picked gets Aven. The default still has no `data-theme`.
- The profile chart still takes `--primary`, which Aven shares with Mint (0183).
