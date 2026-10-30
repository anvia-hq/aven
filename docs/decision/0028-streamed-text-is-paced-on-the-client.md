# Streamed text is paced on the client

Status: accepted. Takes up the pacing that [0027](0027-streamed-text-is-rendered-by-anvia-stream-markdown.md) left for a separate decision.

## Context

Azure's streams arrive in bursts, and the thread showed them as such. Timing the raw network stream of the same prompt on one resource: DeepSeek-V4.1-Flash on chat completions sent 111 deltas in 9 network chunks, 172 ms apart at the median and up to 529 ms; grok-4.7 sent 249 deltas in 10 chunks about 600 ms apart; gpt-5.5 on the Responses API sent 53 chunks 81 ms apart at the median, up to 237 ms. Anthropic's stream is fine-grained, so it looked smooth. Running the agent through `@anvia/durable` (decision 0021) adds little: its event stream reads the journal every 25 ms, and the bursts were the same with and without it.

anvia-harness and openax-v2 read durable the same way and look smooth with Azure. Their message list passes a `stream` prop to `MessagePrimitive.Parts` (`@anvia/react-ui`), which runs `useSmoothStreamItems` from `@anvia/react`: it keeps a short buffer and reveals it frame by frame at 200 to 360 characters a second, faster when a backlog builds up, and drains the rest within about 700 ms once the stream ends. `StreamMarkdown` alone, as 0027 used it, draws each chunk the moment it arrives.

## Decision

- An assistant message's parts go through `useSmoothParts` (`modules/threads/hooks`), which wraps `useSmoothStreamItems` (`@anvia/react`, added to `apps/platform`; the version `@anvia/react-ui` already required). It paces while the message is streaming; a tool call or question after text appears once that text has caught up; the last block stays `live` for `StreamMarkdown` while the hook drains. A message that is complete when first shown (history) appears at once.
- The pacing is over the whole message, not inside `Markdown`. The hook shows whatever text it mounts with at once, and a text block only mounts when its first chunk arrives, so pacing per block let every block's first burst through whole (measured: a 64-character jump at the start of each block). The message exists from `run_start`, before any of its text.
- `useScrollToBottom` follows the content's size with a `ResizeObserver` instead of following message changes, since the paced text grows between events. A reader who has scrolled away is still left where they are.
- The rest of 0027 stands: `StreamMarkdown`, its block memoization and the fade-in.

## Consequences

- Bursty providers read as a steady flow, at the cost of showing text up to a few hundred milliseconds after it arrives, and up to about 700 ms more after the stream ends.
- A provider that sends a whole answer at once (Azure's non-OpenAI models on the Responses API, decision 0026) is paced out too, but quickly, since the hook drains a backlog fast.
- Text the message already has when it is first drawn is shown at once: a client that attaches mid-run sees what was written so far, and text that lands in the same render as `run_start` is not paced. In a real run the model's first token comes long after `run_start`. `e2e/overview.spec.ts` checks that a burst a second after the run starts is paced out.
- The 25 ms poll of durable's event stream stays. Notifying instead of polling would be a change to `@anvia/durable`.
