# 0266. The sidebar of a theme has the colour of the page

Status: accepted. Corrects the palettes of decision 0257.

Every palette of decision 0155 sets `--sidebar: var(--background)`: the sidebar is the same surface as the main content, and the `--frame` colour shows only around them. The four palettes of 0257 (`codex`, `claude`, `devin`, `t3`) copied the other products' own sidebar colours instead (Codex `#171717`, Claude `#191918`, T3 `#0c0c0e`, Devin `#191919`), so in those themes the sidebar stood out from the page and no longer looked like the app in the others.

- The four palettes set `--sidebar` to `var(--background)`, light and dark, like all the others. The page, card and frame colours of 0257 are unchanged, and so are the sidebar's text, accent and border tokens.
