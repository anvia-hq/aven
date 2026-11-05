# The tool group shows the model's reasoning

Status: accepted.

## Context

Reasoning models stream their thinking as `reasoning_delta` events, and a thread's stored history keeps the reasoning parts. None of it reached a client: `projectStreamEvent` dropped reasoning as private, and the durable mapper filtered the deltas out. Yet the thinking between tool calls is often what answers "why is it doing that", and dropping it also split nothing: the reasoning simply never existed in the transcript.

## Decision

- **Reasoning is a message part.** `MessagePart` gains `{ type: "reasoning"; text }` and the run events gain `{ type: "reasoning"; delta }` (packages/protocol). The reducer gathers deltas into one reasoning part until something else arrives; a blank delta opens nothing, as with text. The shared fixtures cover it, so the macOS client reduces the same way.
- **The reasoning is the tool group's.** In the thread view a reasoning part joins the tool block around it instead of standing alone. Inside the opened group it is a row of its own: a brain icon, "Thinking" while it streams and "Thoughts" after, opening to the text on click (`components/reasoning-block.tsx`; the icon set has no brain, so it is a local SVG in the set's stroke style). Reasoning with no call around it stands as that row by itself. `useSmoothParts` paces the text like any text (0028).
- **Providers stay private.** Only displayable text is projected: a reasoning part whose details are encrypted or redacted has none and is skipped, in the stream (no readable deltas exist) and in the stored history (`reasoningDisplayText`). A subagent's reasoning stays its own, as its text does (0057).
- **A reload shows what the live stream did.** `messagesToChat` maps stored reasoning parts to reasoning message parts, so the snapshot and the live reducer agree.

## Consequences

- Older macOS builds decode a `reasoning` event as `.unknown` and ignore it, but a snapshot carrying reasoning parts fails to decode on a build from before this change; update the app.
- What the model reasoned is visible to the person the thread is shared with (0084), as the tool calls already are.
