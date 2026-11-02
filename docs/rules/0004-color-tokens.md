# Color tokens

Status: accepted

Applies to `apps/platform`.

## Rule

Colors come from semantic tokens defined in `src/index.css` (shadcn/ui token structure, oklch palette: a light theme with very low chroma, and a charcoal dark theme with a faint indigo tint, hue 277, on its surfaces; the primary is near-white on dark and near-black on light). Do not use raw palette classes (`neutral-*`, `red-*`, `white`, `black`) or hex/rgb values in components.

| Token pair                              | Use for                         |
| --------------------------------------- | ------------------------------- |
| `background` / `foreground`             | page surface and default text   |
| `card`, `popover` (+ `-foreground`)     | raised surfaces                 |
| `primary` / `primary-foreground`        | main actions                    |
| `secondary`, `accent` (+ `-foreground`) | secondary actions, hover states |
| `muted` / `muted-foreground`            | subdued surfaces and text       |
| `destructive`                           | errors and destructive actions  |
| `border`, `input`, `ring`               | borders, field borders, focus   |
| `frame`                                 | the shell's outer frame         |

Use them as Tailwind utilities: `bg-primary text-primary-foreground`, `text-muted-foreground`, `border-border`, `bg-primary/90`.

## Changing the theme

Edit the CSS variables in `:root` and `.dark` in `src/index.css`. Add a new token in both blocks and map it in `@theme inline` as `--color-<name>`. Dark mode is class based and **the default**. The `theme` module (`src/modules/theme`) holds the light/dark choice in a persisted jotai atom, an inline script in `index.html` applies it before first paint, and `ThemeSelector` (a single toggle button in the authenticated header) flips it. Also define sidebar tokens (`--sidebar-*`) when you change the theme.

## Base UI

Tokens are independent of the component library. Components stay Base UI wrappers in `src/components/` (see `0003-ui-primitives-base-ui.md`) styled with these tokens. This matches shadcn/ui's Base UI variant, so shadcn components can be copied in later without changing the setup.

## Fonts

Geist (sans) and Geist Mono come from `@fontsource-variable/geist` and `@fontsource-variable/geist-mono`, imported in `src/index.css` and mapped to `--font-sans` and `--font-mono` in `@theme inline`. Use `font-sans` / `font-mono`, never a hard-coded family.
