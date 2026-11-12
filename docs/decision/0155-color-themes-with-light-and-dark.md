# 0155: Color themes, each with light and dark

Status: accepted. Builds on the semantic color tokens in `index.css`. The "Dark mode" switch and the header's toggle are superseded by 0224: the mode is a select with a system choice.

## Decision

- A theme (a palette) and a mode (light or dark) are two separate choices, both kept on the device in local storage (`palette`, `theme`).
- The mode is the `dark` class on `<html>`, as before. The palette is `data-theme="<id>"` on `<html>`; the default, mint, sets none, so `:root` and `.dark` stay as they were.
- Each other palette (catppuccin, tokyo-night, github, one-dark, solarized, nord, dracula, gruvbox, rose-pine, monokai, ayu, material, everforest, night-owl, palenight, kanagawa, oceanic, horizon, zenburn, synthwave) is a `:root[data-theme="<id>"]` block and a `:root[data-theme="<id>"].dark` block in `index.css` that re-set the neutral and accent tokens. Status colors (destructive, success, graphs) stay shared.
- Settings, Profile, Appearance has a "Theme" dropdown (a Select) and the "Dark mode" switch. The header's toggle still flips the mode.

## Consequences

- Each palette is a well-known developer color scheme (Catppuccin, Tokyo Night, GitHub, One Dark, Solarized, Nord, Dracula, Gruvbox, Rosé Pine, Monokai, Ayu, Material, Everforest, Night Owl, Palenight, Kanagawa, Oceanic, Horizon, Zenburn, Synthwave), with its own light and dark mode. Each block sets `--border`, `--input` and `--sidebar-border` itself, because the light block's are more specific than `.dark` and would otherwise show in dark mode.

- A new theme is a new pair of blocks, an id in `Palette` and an entry in `PALETTES` (`modules/theme/types.ts`).
- The choice does not follow the person to other devices.
