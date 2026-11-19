# 0257: Themes of other coding tools, with a heading face of their own

Status: accepted. Builds on 0155 (color themes, each with light and dark) and 0157 (the interface font can be chosen).

## Context

People arrive from other coding agents and recognise their surfaces. Four palettes in the shapes of Codex, Claude, Devin and T3 let them keep a screen they already know, and let the team compare Aven's own screens in a look it did not invent.

Each product publishes at least part of its design tokens, and where it does, the palette is taken from them rather than from a screenshot: ChatGPT's and Codex's grays (`#212121` page, `#171717` sidebar, `#303030` elevated, system font stacks), Devin's page and wash grays (`#141414`, `#191919`, `#282828`) with its blue (`#317cff` dark, `#005fcc` light), its Inter, and its orange and green; Claude's bone and clay; T3's near-black zinc and violet.

## Decision

- Four more palettes, `codex`, `claude`, `devin` and `t3`, appended to `PALETTES` (`modules/theme/types.ts`), each a light and a dark block in `index.css`, like every other palette of 0155. Status colors stay shared.
- A palette may name a heading face (`PaletteOption.heading`): Claude sets Source Serif 4, the closest open face to the serif of Claude's headings; Devin sets Inter, which its tokens name as the UI font; T3 sets Geist. Codex sets none, because OpenAI's own tokens are the system stacks.
- `--heading-font` is the palette's face or the person's interface font, and `h1` to `h4` are set in it. Body text keeps the interface font of 0157: two choices, two jobs.
- The heading face loads from Google Fonts through one `<link id="aven-theme-font">`, as the interface font does (0157). Offline, the browser falls back to the local stack.
- Each palette names its own `--radius` (Devin `0.5rem`, T3 `0.625rem`, Codex and Claude `0.75rem`), so cards and buttons round as those products' do.

## Consequences

- With a palette that names a heading face, a heading is not the person's interface font. A person who wants one face everywhere picks Mint or one of the palettes that names none.
- Two colors are darker than the product's own so that text keeps its contrast: Claude's clay is `#b5552f` in light, not `#d97757` (2.96:1 on bone; the darker clay is 4.6:1), and Devin's dark primary is `#4d8dff` with dark text, not white on `#317cff` (3.85:1).
- T3 publishes no token set, so its palette is drawn from its zinc-and-violet identity rather than from a stylesheet.
- Proof: `.aven/proof/themes/<id>-<light|dark>-thread.png` for the four palettes on one thread screen, recorded by `e2e/themes.spec.ts` when `THEME_SHOTS=1`.
