# Streamed text is rendered with Anvia's StreamMarkdown

Status: accepted. Changes how the platform draws an assistant's text; nothing on the wire.

## Context

Text reached the browser steadily (measured end to end with a real Chromium on the running stack: Anthropic 197 to 249 `text` events over 4 to 5 s, no gap over 110 ms), yet the thread showed it in chunks. In a run that used tools, the screen changed 6 times for 56 events (median 689 ms apart, up to 246 characters at once). The platform re-parsed the whole message with `react-markdown` on every delta, so rendering fell behind the stream and React merged the updates.

The anvia-harness app renders the same kind of stream with `StreamMarkdown` from `@anvia/react-ui`: it splits the text into blocks and memoizes each finished one, so only the block being written is parsed again, and the newest characters fade in (a CSS reveal the app styles), so arriving text reads as one flow.

## Decision

- `components/markdown.tsx` renders with `StreamMarkdown` (`@anvia/react-ui/stream`, added to `apps/platform`; only the stream part is imported). `live` is true for the last block of the message the agent is still writing (`ThreadMessages` takes `running`, `ThreadMessage` takes `streaming`).
- `index.css` has the `stream-fade-in` keyframes and the `[data-state="revealing"]` rule, switched off under `prefers-reduced-motion`.

## Consequences

- Same run, measured the same way: 27 screen updates a median 31 ms apart; on a plain 500-word answer 188 updates, none more than 109 ms apart, and the screen's gaps equal the stream's.
- A provider that sends its answer in one burst (Azure's non-OpenAI models on the Responses API, decision 0026) still arrives at once; the reveal only softens the last few characters. Pacing text out over time would be a separate decision.
- `@anvia/react-ui` brings TipTap and other composer packages into `node_modules`; they are not imported, so not bundled.
