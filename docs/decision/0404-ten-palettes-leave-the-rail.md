# Ten palettes leave the rail

Status: accepted. Supersedes 0155 in part: the 20-palette catalog keeps its mechanism, but the ten named below leave the rail and the picker.

## Context

Settings > Appearance offers a rail of 26 palette cards: Aven, Mint, 21 well-known developer color schemes, and the four coding-tool themes. Ten of the well-known schemes add choice without adding readers: Catppuccin, Tokyo Night, Solarized, Dracula, Gruvbox, Ayu, Everforest, Palenight, Kanagawa, Zenburn. Nobody asks for them back by name, and every card kept is a card a person must scan past to reach the one they want.

## Decision

- **The picker lists 16 palettes**: Aven, Mint, GitHub, One Dark, Nord, Rosé Pine, Monokai, Material, Night Owl, Oceanic, Horizon, Synthwave, Codex, Claude, Devin, T3. The ten removed ids leave `Palette`, `PALETTES`, `index.css`, and the e2e anchor (now GitHub) together.
- **A stored choice of a removed palette falls back to Aven.** The stored id no longer matches `PALETTES`, so `useTheme` treats it as unknown and the app paints the default instead of an unstyled page.

## Consequences

- The theme gallery regenerates to 16 cards; its 32 captures replace the old 52.
- `docs/products/0007-system-reference.md` names the 16 instead of 21 well-known schemes.
