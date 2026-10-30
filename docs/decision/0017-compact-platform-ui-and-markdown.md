# Compact platform UI and Markdown for agent text

Status: accepted

## Decision

- The platform keeps its layout (sidebar and inset) but is denser: one-row page headers, short table rows, a monochrome primary, thin scrollbars. Type sizes stay normal; the root font size is not scaled.
- Each panel of a thread owns its toolbar: the conversation (title, runtime, stop, desktop toggle) and the Desktop panel (take over, close).
- Consecutive tool calls in a message are one collapsed row summarizing them ("Ran 2 commands, edited 2 files"); a lone call stays a row of its own.
- Agent text renders as Markdown with `react-markdown` and `remark-gfm`, styled by `@tailwindcss/typography`. Raw HTML is not rendered, and links open in a new tab. The plugin's colors are mapped to the semantic tokens in an unlayered block in `index.css`, because the plugin's own rules would otherwise win.
- `@anvia/react-ui` is headless and has no Markdown renderer, so it is not used for this.

## Consequences

The scroll area of a conversation spans the whole panel and the composer floats over it, so the bottom padding of the messages (`pb-48`) must stay at least as tall as the composer.
