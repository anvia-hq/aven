# Compact platform UI and Markdown for agent text

Status: accepted

## Decision

- The platform keeps its layout (sidebar and inset) but is denser: one-row page headers, short table rows, a monochrome primary, thin scrollbars. Type sizes stay normal; the root font size is not scaled.
- Each panel of a thread owns its toolbar: the conversation (title, runtime, stop, desktop toggle) and the Desktop panel (take over, close).
- Consecutive tool calls in a message are one collapsed row summarizing them ("Ran 2 commands, edited 2 files"); a lone call stays a row of its own.
- Agent text renders as Markdown with `react-markdown` and `remark-gfm`, styled by `@tailwindcss/typography`. Raw HTML is not rendered, and links open in a new tab. The plugin's colors are mapped to the semantic tokens in an unlayered block in `index.css`, because the plugin's own rules would otherwise win.
- The composer's model, provider and reasoning effort live in one pill on the right of the composer and one popover panel (model search and list, effort slider); the attachment button on the left is not wired up yet.
- The sidebar has no toggle on wide screens: its edge is a drag handle (`modules/navigation`), and its width, the thread panel sizes and whether the desktop is open are kept in localStorage (`hooks/use-local-storage.ts`; the panel sizes through `react-resizable-panels`' `useDefaultLayout`). The model selection was already kept.
- A thread in the sidebar carries a cloud icon (pulsing while it runs); every session runs on the control plane's runner or another runner.
- A thread's overview (Environment: runner, repository, branch; Context: how full the model's context window is) is a column inside the conversation panel, toggled from the conversation toolbar next to the Desktop toggle. It sits in the conversation's scroll area, so the scrollbar is at the panel's edge, and it only shows when the panel is wide (a container query). The desktop opens when asked for, as its own resizable panel.
- Context and usage come from `@anvia/core`: each model call's usage becomes a `usage` run event (the call's tokens, plus the context window when known). The control plane adds them to what the thread's stored messages already hold, and clients do the same, so totals survive a restart. Two cards say two different things: Context is how full the window was on the latest request (the whole conversation as sent), and Usage is every call added up, as a flat list: input (all of it), output, cache write, cache read, and uncached (the input minus the two cache figures). Usage dwarfs Context because each call resends the history. The window comes from the SDK for the models it knows, else from models.dev (`limit.context`) through the control plane, which sends it with the run; a model neither knows has no Context card. Core gives totals, not a split of the window by messages or tools. A runner's events are checked against an allow-list in the control plane (`runtimes/wire.ts`), so a new event type must be added there too.
- `@anvia/react-ui` is headless and has no Markdown renderer, so it is not used for this.

## Consequences

The scroll area of a conversation spans the whole panel and the composer floats over it, so the bottom padding of the messages (`pb-48`) must stay at least as tall as the composer.
