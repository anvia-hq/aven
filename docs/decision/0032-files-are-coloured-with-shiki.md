# Files in the Files panel are coloured with shiki

Status: accepted. Supersedes the "No syntax colours" point of 0031.

## Context

Decision 0031 showed files as plain monospace because a highlighter was a new dependency. A person reading code in the panel wants colours like their editor's. Options asked about: shiki, highlight.js and sugar-high; shiki was chosen.

## Decision

- **`shiki` is added to `apps/platform`** (it was there before and was removed as unused). It is used through `createHighlighter` with the JavaScript regex engine, so there is no WASM to ship.
- **Both themes are coloured in one pass.** Tokens carry `--shiki-light` and `--shiki-dark` (`github-light`, `github-dark`), and the span picks one with Tailwind's `dark:` variant. Changing the theme needs no new pass. These two palettes are the one place colours are not our semantic tokens, as a syntax theme is a palette of its own.
- **The language comes from the file's name** (extension, plus `Dockerfile` and `Makefile`). A file with no known grammar stays plain.
- **It is fetched when the first file opens.** `highlight.ts` is imported dynamically, and each grammar is its own chunk, so the thread page is no bigger for it (516 kB, from 534 kB before this and 728 kB had the import been static).
- **Colours arrive after the text.** The file shows plain at once and is coloured when the grammar has loaded; colours made for other text are never drawn over this text. A grammar that fails to load leaves the file plain.
- **A file over 200,000 characters is not coloured**, so one large file does not hold the page up.

## Consequences

- Every change to a file shown while the agent works is coloured again, from the start of the file.
- Only the grammars of files that are opened are downloaded; about 460 chunks exist.
- Some language ids in shiki are aliases, and a file with an extension that is also a grammar alias is coloured by that grammar.
